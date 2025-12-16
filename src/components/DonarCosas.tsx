import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Gift, Plus, Trash2, MapPin, Camera, X, Image } from 'lucide-react';
import { toast } from 'sonner';

interface Listing {
  id: string;
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
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
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        toast.success('Ubicación obtenida');
      },
      (error) => {
        console.error('Error getting location:', error);
        toast.error('No se pudo obtener tu ubicación');
      }
    );
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: PhotoPreview[] = [];
    const maxPhotos = 3;
    const remaining = maxPhotos - photos.length;

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newPhotos.push({
          file,
          preview: URL.createObjectURL(file)
        });
      }
    }

    if (files.length > remaining) {
      toast.info(`Máximo ${maxPhotos} fotos permitidas`);
    }

    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
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
          latitude: location?.lat || null,
          longitude: location?.lng || null,
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
      setLocation(null);
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
    setLocation(null);
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
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={photos.length >= 3}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {photos.length === 0 ? 'Agregar fotos' : `${photos.length}/3 fotos`}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional: hasta 3 fotos del artículo
                </p>
                
                {/* Photo previews */}
                {photos.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img
                          src={photo.preview}
                          alt={`Preview ${index + 1}`}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={getCurrentLocation}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  {location ? 'Ubicación agregada ✓' : 'Agregar mi ubicación'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional: ayuda a que te encuentren cerca
                </p>
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
