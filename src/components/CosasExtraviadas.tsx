import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Search, Plus, Trash2, Camera, X, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useMunicipios } from '@/hooks/useMunicipios';
import { ListingPublicChat } from './ListingPublicChat';

interface Listing {
  id: string;
  title: string;
  description: string | null;
  estado: string | null;
  municipio: string | null;
  created_at: string;
  is_active: boolean;
  is_free: boolean; // true = perdido, false = encontrado
  unread_count?: number;
}

interface PhotoPreview {
  file: File;
  preview: string;
}

export function CosasExtraviadas() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tipoPost, setTipoPost] = useState<'perdido' | 'encontrado'>('perdido');
  const [loading, setLoading] = useState(false);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [estado, setEstado] = useState('Sonora');
  const [municipio, setMunicipio] = useState('Cajeme');
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [chatListingId, setChatListingId] = useState<string | null>(null);
  const [chatListingTitle, setChatListingTitle] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { getEstados, getMunicipios, loading: municipiosLoading } = useMunicipios();
  const estados = getEstados();
  const municipios = getMunicipios(estado);

  useEffect(() => {
    fetchUserProfile();
    fetchCategory();
  }, []);

  useEffect(() => {
    if (profileId && categoryId) {
      fetchMyListings();
    }
  }, [profileId, categoryId]);

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

  const fetchCategory = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id')
      .eq('name', 'Cosas Extraviadas')
      .single();

    if (data) {
      setCategoryId(data.id);
    }
  };

  const fetchMyListings = async () => {
    if (!profileId || !categoryId || !userId) return;

    const { data } = await supabase
      .from('listings')
      .select('*')
      .eq('profile_id', profileId)
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) {
      // Fetch unread counts for each listing
      const listingsWithUnread = await Promise.all(
        data.map(async (listing) => {
          const { count } = await supabase
            .from('listing_comments')
            .select('*', { count: 'exact', head: true })
            .eq('listing_id', listing.id)
            .eq('is_read', false)
            .neq('user_id', userId);
          
          return { ...listing, unread_count: count || 0 };
        })
      );
      setMyListings(listingsWithUnread);
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

      const { error: uploadError } = await supabase.storage
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
    
    if (!profileId || !categoryId) {
      toast.error('Debes iniciar sesión para publicar');
      return;
    }

    if (!title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    setLoading(true);

    try {
      // Set expires_at to 100 years from now (effectively no expiration)
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);

      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          profile_id: profileId,
          category_id: categoryId,
          title: title.trim(),
          description: description.trim() || null,
          is_free: tipoPost === 'perdido', // true = perdido, false = encontrado
          is_active: true,
          estado: estado,
          municipio: municipio,
          price: 0,
          expires_at: farFuture.toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      // Upload photos if any
      if (listing && photos.length > 0) {
        await uploadPhotos(listing.id);
      }

      toast.success(`¡Publicación creada! ${tipoPost === 'perdido' ? 'Esperamos que lo encuentres pronto.' : 'Gracias por ayudar.'}`);
      resetForm();
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
    setTipoPost('perdido');
    setEstado('Sonora');
    setMunicipio('Cajeme');
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
  };

  if (!profileId) {
    return (
      <Card className="border-dashed border-2 border-orange-500/30">
        <CardContent className="py-8 text-center">
          <Search className="h-12 w-12 mx-auto mb-4 text-orange-500/50" />
          <p className="text-muted-foreground">Inicia sesión para reportar objetos extraviados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-orange-500" />
          Cosas Extraviadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          ¿Perdiste o encontraste algo? Publica aquí para ayudar a la comunidad.
        </p>

        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 mr-2" />
              Reportar objeto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Reportar objeto extraviado</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tipo de reporte */}
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de reporte *</label>
                <RadioGroup
                  value={tipoPost}
                  onValueChange={(val) => setTipoPost(val as 'perdido' | 'encontrado')}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="perdido" id="perdido" />
                    <Label htmlFor="perdido" className="cursor-pointer">Perdí algo</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="encontrado" id="encontrado" />
                    <Label htmlFor="encontrado" className="cursor-pointer">Encontré algo</Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Input
                  placeholder={tipoPost === 'perdido' ? '¿Qué perdiste?' : '¿Qué encontraste?'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <Textarea
                  placeholder="Descripción detallada (color, tamaño, dónde se perdió/encontró, etc.)"
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
                  Opcional: 1 foto del objeto
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
              <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600" disabled={loading}>
                {loading ? 'Publicando...' : 'Publicar reporte'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {myListings.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Mis reportes activos:</p>
            {myListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${listing.is_free ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {listing.is_free ? 'Perdido' : 'Encontrado'}
                    </span>
                    <p className="font-medium text-sm">{listing.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {listing.estado}, {listing.municipio}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChatListingId(listing.id);
                      setChatListingTitle(listing.title);
                    }}
                    className="relative"
                  >
                    <MessageCircle className="h-4 w-4 text-orange-500" />
                    {(listing.unread_count ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs px-1 py-0.5 rounded-full min-w-[16px] text-center">
                        {listing.unread_count}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(listing.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat Dialog */}
        <Dialog open={!!chatListingId} onOpenChange={(open) => {
          if (!open) {
            setChatListingId(null);
            setChatListingTitle('');
            fetchMyListings(); // Refresh to update unread counts
          }
        }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Mensajes: {chatListingTitle}</DialogTitle>
            </DialogHeader>
            {chatListingId && (
              <ListingPublicChat
                listingId={chatListingId}
                listingTitle={chatListingTitle}
                ownerId={userId || undefined}
                isOwnerView={true}
                defaultExpanded={true}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
