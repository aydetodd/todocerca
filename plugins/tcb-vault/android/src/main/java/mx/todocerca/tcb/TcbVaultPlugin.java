package mx.todocerca.tcb;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Backup only: no network, money writes, exports or browser key material. */
@CapacitorPlugin(name = "TcbVault")
public class TcbVaultPlugin extends Plugin {
    private static final Object LOCK = new Object();
    private static final byte[] MAGIC = {84, 67, 66, 0, 1};
    private static final long MAX_SAFE = 9007199254740991L;

    private String validate(PluginCall call) throws Exception {
        String scope = call.getString("scope", "");
        String card = call.getString("cardId", "");
        if (!scope.matches("[0-9a-f]{64}") || !card.matches("[0-9]{16}")) throw new Exception();
        return scope;
    }

    private AtomicFile file(String scope, String card) throws Exception {
        File directory = new File(getContext().getNoBackupFilesDir(), "tcb/" + scope);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception();
        return new AtomicFile(new File(directory, card + ".tcb"));
    }

    private SecretKey key(String scope, String card, boolean create) throws Exception {
        String alias = "todocerca.tcb." + scope + "." + card;
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        if (!create) throw new Exception(); // Never silently replace the key of an existing file.
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private byte[] content(byte[] value, String card) throws Exception {
        if (value.length != 106 || value[0] != 0 || value[1] != 1 ||
            !new String(value, 2, 16, StandardCharsets.US_ASCII).equals(card)) throw new Exception();
        ByteBuffer buffer = ByteBuffer.wrap(value);
        for (int offset : new int[] {18, 26, 34}) {
            long number = buffer.getLong(offset);
            if (number < 0 || number > MAX_SAFE) throw new Exception();
        }
        boolean genesis = Arrays.equals(Arrays.copyOfRange(value, 42, 74), new byte[32]);
        if ((buffer.getLong(34) == 0) != genesis) throw new Exception();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(Arrays.copyOf(value, 74));
        if (!MessageDigest.isEqual(digest, Arrays.copyOfRange(value, 74, 106))) throw new Exception();
        return value;
    }

    private String hash(byte[] value) {
        StringBuilder result = new StringBuilder();
        for (int i = 74; i < 106; i++) result.append(String.format(java.util.Locale.ROOT, "%02x", value[i] & 255));
        return result.toString();
    }

    private byte[] load(AtomicFile file, SecretKey secret, String card) throws Exception {
        byte[] envelope = file.readFully();
        if (envelope.length != 139 || !Arrays.equals(Arrays.copyOf(envelope, 5), MAGIC)) throw new Exception();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Arrays.copyOfRange(envelope, 5, 17)));
        cipher.updateAAD(Arrays.copyOf(envelope, 17));
        return content(cipher.doFinal(Arrays.copyOfRange(envelope, 17, 139)), card);
    }

    @PluginMethod
    public void read(PluginCall call) {
        synchronized (LOCK) {
            try {
                String scope = validate(call), card = call.getString("cardId");
                AtomicFile target = file(scope, card);
                // AtomicFile recovers its backup after interrupted writes.
                boolean exists = target.getBaseFile().exists() || new File(target.getBaseFile() + ".bak").exists();
                JSObject result = new JSObject();
                result.put("payload", exists ? Base64.encodeToString(load(target, key(scope, card, false), card), Base64.NO_WRAP) : org.json.JSONObject.NULL);
                call.resolve(result);
            } catch (Exception ignored) { call.reject("TCB_VAULT_READ_FAILED"); }
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        synchronized (LOCK) {
            FileOutputStream stream = null;
            AtomicFile target = null;
            try {
                String scope = validate(call), card = call.getString("cardId");
                String encoded = call.getString("payload", "");
                if (encoded.length() != 144) throw new Exception();
                byte[] payload = content(Base64.decode(encoded, Base64.NO_WRAP), card);
                target = file(scope, card);
                boolean exists = target.getBaseFile().exists() || new File(target.getBaseFile() + ".bak").exists();
                SecretKey secret = key(scope, card, !exists);
                String expected = call.getString("expectedHash");
                if (exists) {
                    byte[] prior = load(target, secret, card);
                    if (!hash(prior).equals(expected)) throw new Exception();
                    // Idempotent retry does not rewrite or rotate the envelope.
                    if (MessageDigest.isEqual(prior, payload)) { call.resolve(); return; }
                    ByteBuffer a = ByteBuffer.wrap(prior), b = ByteBuffer.wrap(payload);
                    if (a.getLong(34) == MAX_SAFE || b.getLong(34) != a.getLong(34) + 1 || b.getLong(26) < a.getLong(26) ||
                        !MessageDigest.isEqual(Arrays.copyOfRange(prior, 74, 106), Arrays.copyOfRange(payload, 42, 74))) throw new Exception();
                } else if (expected != null || ByteBuffer.wrap(payload).getLong(34) != 0) { throw new Exception(); }
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, secret); // Keystore generates a fresh IV.
                byte[] header = new byte[17];
                System.arraycopy(MAGIC, 0, header, 0, 5);
                if (cipher.getIV().length != 12) throw new Exception();
                System.arraycopy(cipher.getIV(), 0, header, 5, 12);
                cipher.updateAAD(header);
                byte[] encrypted = cipher.doFinal(payload);
                stream = target.startWrite();
                stream.write(header);
                stream.write(encrypted);
                target.finishWrite(stream);
                stream = null;
                if (!MessageDigest.isEqual(load(target, secret, card), payload)) throw new Exception();
                call.resolve();
            } catch (Exception ignored) {
                if (target != null && stream != null) target.failWrite(stream);
                call.reject("TCB_VAULT_WRITE_FAILED");
            }
        }
    }
}