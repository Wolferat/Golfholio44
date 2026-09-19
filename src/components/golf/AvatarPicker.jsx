import { useState } from 'react';
import { Upload, Check, Loader2, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import BottomSheet from './BottomSheet';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { DEFAULT_AVATARS } from '@/lib/defaultAvatars';
import { cn } from '@/lib/utils';

// ============================================================
// AvatarPicker — choose an avatar source.
//
// Options:
//   1. Upload a photo (UploadPrivateFile → savePlayerProfile)
//   2. Choose a default golf-themed avatar
//   3. Use initials (no image)
//
// Uploads go through private storage with server-side safety
// checks. The raw file_uri is never exposed to other players.
// ============================================================

export default function AvatarPicker({ open, onClose, currentSource, currentDefaultId, onSave }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [selectedDefault, setSelectedDefault] = useState(currentDefaultId || null);
  const [selectedSource, setSelectedSource] = useState(currentSource || 'initials');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large (max 10 MB)' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Only image files are allowed' });
      return;
    }
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await onSave({ avatar_source: 'upload', avatar_uri: file_uri });
    } catch {
      toast({ title: 'Upload failed' });
    }
    setUploading(false);
  };

  const handleDefaultSelect = (id) => {
    setSelectedDefault(id);
    setSelectedSource('default');
  };

  const handleSaveDefault = () => {
    if (selectedSource === 'default' && selectedDefault) {
      onSave({ avatar_source: 'default', avatar_default_id: selectedDefault });
    } else if (selectedSource === 'initials') {
      onSave({ avatar_source: 'initials' });
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="80dvh">
      <div className="px-5 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold">Choose your avatar</h2>
        <p className="text-sm text-muted-foreground mt-1">Upload a photo or pick a golf-themed default.</p>

        {/* Upload */}
        <label className="mt-4 w-full h-14 rounded-2xl border-2 border-dashed border-border flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer hover:border-primary/50 transition">
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4" /> Upload a photo</>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <p className="text-[11px] text-muted-foreground mt-1.5">Photos are safety-checked before being shown. Max 10 MB.</p>

        {/* Default avatars */}
        <p className="text-xs font-semibold text-muted-foreground mt-5 mb-2">Or pick a default</p>
        <div className="grid grid-cols-4 gap-3">
          {DEFAULT_AVATARS.map((avatar) => (
            <motion.button
              key={avatar.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleDefaultSelect(avatar.id)}
              className={cn(
                'aspect-square rounded-2xl overflow-hidden border-2 transition relative',
                selectedSource === 'default' && selectedDefault === avatar.id
                  ? 'border-primary shadow-lg shadow-primary/30'
                  : 'border-border'
              )}
            >
              <img src={avatar.url} alt={avatar.label} className="h-full w-full object-cover" />
              {selectedSource === 'default' && selectedDefault === avatar.id && (
                <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary grid place-items-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Initials option */}
        <button
          onClick={() => { setSelectedSource('initials'); setSelectedDefault(null); }}
          className={cn(
            'mt-3 w-full h-12 rounded-2xl border-2 flex items-center justify-center gap-2 text-sm font-medium transition',
            selectedSource === 'initials' ? 'border-primary text-primary' : 'border-border text-muted-foreground'
          )}
        >
          <ImageIcon className="h-4 w-4" /> Use initials (no image)
        </button>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 h-12"
            onClick={handleSaveDefault}
            disabled={selectedSource === 'default' && !selectedDefault}
          >
            Save avatar
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}