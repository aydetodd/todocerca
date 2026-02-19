
CREATE OR REPLACE FUNCTION public.send_system_welcome_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
  welcome_msg TEXT;
  user_apodo TEXT;
BEGIN
  IF NEW.user_id = system_user_id THEN
    RETURN NEW;
  END IF;

  user_apodo := COALESCE(NEW.apodo, NEW.nombre, 'Usuario');
  
  welcome_msg := 'Estimado ' || user_apodo || ',

¡Bienvenido a TodoCerca! 🙌

Agradecemos profundamente que hayas confiado en nosotros para conectar con negocios y servicios cerca de ti. Cada vez que usas la app, ayudas a fortalecer el comercio local y a construir una comunidad más unida.

Pero queremos invitarte a dar un paso más: ¿ya pensaste en ofrecer tus productos o servicios a través de TodoCerca?

📍 Como proveedor en TodoCerca, tú:
✔️ Llegas a clientes en tu colonia que ya buscan lo que ofreces
✔️ Recibes pedidos directos sin intermediarios
✔️ Pagas 0% de comisión en pagos en efectivo
✔️ Actualizas tu catálogo al instante desde tu celular
✔️ Obtienes tu propio link y QR personalizados
✔️ Apareces en búsquedas locales dentro de la app

🎁 ¡Prueba gratis por 7 días, sin necesidad de tarjeta! Esta promoción no tiene fecha límite: puedes activarla cuando tú lo decidas, sin prisas.

💡 ¿Vendes alimentos, ofreces servicios a domicilio, tienes un pequeño negocio o compartes habilidades? ¡Tu vecindario te está buscando!

👉 Activa tu catálogo digital en 2 minutos desde tu perfil.

No necesitas app aparte: usa la misma cuenta de TodoCerca que ya tienes. Solo completa tu perfil de negocio y obtén al instante tu link + QR. ¡Tu negocio visible, organizado y actualizable desde tu celular! 📲💚

Si tienes alguna duda o necesitas ayuda, responde este mensaje y con gusto te asistimos.

— El equipo de TodoCerca
Digitalización Integral para tu comunidad';

  INSERT INTO public.messages (sender_id, receiver_id, message, is_panic, is_read)
  VALUES (system_user_id, NEW.user_id, welcome_msg, false, false);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error sending welcome message to user %: %', NEW.user_id, SQLERRM;
    RETURN NEW;
END;
$function$;
