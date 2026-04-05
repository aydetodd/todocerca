-- Create storage bucket for credential uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('credenciales', 'credenciales', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users upload own credentials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'credenciales' AND (storage.foldername(name))[1] = 'descuentos');

-- Allow public read access
CREATE POLICY "Public read credentials"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'credenciales');