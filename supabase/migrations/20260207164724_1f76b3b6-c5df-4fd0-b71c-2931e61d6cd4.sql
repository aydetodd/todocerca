-- Add missing DELETE policy so drivers can turn off their own routes
CREATE POLICY "asignaciones_chofer_delete"
ON public.asignaciones_chofer
FOR DELETE
TO authenticated
USING (is_chofer_self(chofer_id, auth.uid()));