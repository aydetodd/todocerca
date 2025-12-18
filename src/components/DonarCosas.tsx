import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gift, Plus, Trash2, Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMunicipios } from '@/hooks/useMunicipios';

interface Listing {
  id: string;
  title: string;
  description: string | null;
  estado: string | null;
  municipio: string | null;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

interface PhotoPreview {
  file: File;
  preview: string;
}

export function DonarCosas() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cosasRegaladasCategoryId, setCosasRegaladasCategoryId] = useState<string | null>(null);
  const [estado, setEstado] = useState('Sonora');
  const [municipio, setMunicipio] = useState('Cajeme');
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { getEstados, getMunicipios, loading: municipiosLoading } = useMunicipios();
  const estados = getEstados();
  const municipios = getMunicipios(estado);

  useEffect(() => {
    fetchUserProfile();
    fetchCosasRegaladasCategory();
  }, []);

  useEffect(() => {
    if (profileId) {
      fetchMyListings();
    }
  }, [profileId]);

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      setProfileId(profile.id);
    }
  };

  const fetchCosasRegaladasCategory = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id')
      .eq('name', 'Cosas Regaladas')
      .single();

    if (data) {
      setCosasRegaladasCategoryId(data.id);
    }
  };

  const fetchMyListings = async () => {
    if (!profileId || !cosasRegaladasCategoryId) return;

    const { data } = await supabase
      .from('listings')
      .select('*')
      .eq('profile_id', profileId)
      .eq('category_id', cosasRegaladasCategoryId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) {
      setMyListings(data);
    }
  };

  // Reset municipio when estado changes
  useEffect(() => {
    if (municipios.length > 0 && !municipios.includes(municipio)) {
      setMunicipio(municipios[0] || '');
    }
  }, [estado, municipios]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes');
      return;
    }

    // Clear previous photo if any
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    
    setPhotos([{
      file,
      preview: URL.createObjectURL(file)
    }]);
  };

  const removePhoto = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
  };

  const uploadPhotos = async (listingId: string): Promise<void> => {
    if (!userId || photos.length === 0) return;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const fileExt = photo.file.name.split('.').pop();
      const fileName = `${userId}/${listingId}/${Date.now()}_${i}.${fileExt}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('listing-photos')
        .upload(fileName, photo.file);

      if (uploadError) {
        console.error('Error uploading photo:', uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('listing-photos')
        .getPublicUrl(fileName);

      await supabase.from('fotos_listings').insert({
        listing_id: listingId,
        url: publicUrl,
        nombre_archivo: photo.file.name,
        mime_type: photo.file.type,
        file_size: photo.file.size,
        es_principal: i === 0
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileId || !cosasRegaladasCategoryId) {
      toast.error('Debes iniciar sesión para publicar');
      return;
    }

    if (!title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    setLoading(true);

    try {
      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          profile_id: profileId,
          category_id: cosasRegaladasCategoryId,
          title: title.trim(),
          description: description.trim() || null,
          is_free: true,
          is_active: true,
          estado: estado,
          municipio: municipio,
          price: 0
        })
        .select('id')
        .single();

      if (error) throw error;

      // Upload photos if any
      if (listing && photos.length > 0) {
        await uploadPhotos(listing.id);
      }

      toast.success('¡Publicación creada! Estará visible por 2 días.');
      setTitle('');
      setDescription('');
      setEstado('Sonora');
      setMunicipio('Cajeme');
      setPhotos([]);
      setIsOpen(false);
      fetchMyListings();
    } catch (error) {
      console.error('Error creating listing:', error);
      toast.error('Error al crear la publicación');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (listingId: string) => {
    try {
      const { error } = await supabase
        .from('listings')
        .update({ is_active: false })
        .eq('id', listingId);

      if (error) throw error;

      toast.success('Publicación eliminada');
      fetchMyListings();
    } catch (error) {
      console.error('Error deleting listing:', error);
      toast.error('Error al eliminar la publicación');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEstado('Sonora');
    setMunicipio('Cajeme');
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
  };

  if (!profileId) {
    return (
      <Card className="border-dashed border-2 border-primary/30">
        <CardContent className="py-8 text-center">
          <Gift className="h-12 w-12 mx-auto mb-4 text-primary/50" />
          <p className="text-muted-foreground">Inicia sesión para donar cosas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          Cosas Regaladas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          ¿Tienes algo que ya no necesitas? ¡Regálalo a la comunidad!
        </p>

        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Publicar algo gratis
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Regalar algo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  placeholder="¿Qué quieres regalar?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <Textarea
                  placeholder="Descripción (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>

              {/* Photo upload section */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={photos.length >= 1}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {photos.length === 0 ? 'Agregar foto' : 'Foto agregada ✓'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional: 1 foto del artículo
                </p>
                
                {/* Photo preview */}
                {photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    <div className="relative">
                      <img
                        src={photos[0].preview}
                        alt="Preview"
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Estado selector */}
              <div>
                <label className="text-sm font-medium mb-1 block">Estado *</label>
                <Select value={estado} onValueChange={setEstado} disabled={municipiosLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((est) => (
                      <SelectItem key={est} value={est}>{est}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Municipio selector */}
              <div>
                <label className="text-sm font-medium mb-1 block">Municipio *</label>
                <Select value={municipio} onValueChange={setMunicipio} disabled={municipiosLoading || municipios.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    {municipios.map((mun) => (
                      <SelectItem key={mun} value={mun}>{mun}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Publicando...' : 'Publicar gratis'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {myListings.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Mis publicaciones activas:</p>
            {myListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <p className="font-medium text-sm">{listing.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Expira: {new Date(listing.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(listing.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
