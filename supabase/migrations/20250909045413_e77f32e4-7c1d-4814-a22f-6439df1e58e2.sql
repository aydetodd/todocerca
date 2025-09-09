-- Actualizar las políticas para permitir mejor el registro de usuarios

-- Política mejorada para inserción de clientes
DROP POLICY IF EXISTS "Users can insert their own cliente data" ON public.clientes;
CREATE POLICY "Users can insert their own cliente data" 
ON public.clientes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política mejorada para inserción de proveedores
DROP POLICY IF EXISTS "Users can insert their own proveedor data" ON public.proveedores;
CREATE POLICY "Users can insert their own proveedor data" 
ON public.proveedores 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Asegurar que las políticas de perfil también funcionen correctamente
-- Agregar política de inserción para perfiles si no existe
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);