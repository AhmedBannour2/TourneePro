import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, Lock, FileText, Upload, Download, Trash2,
  Loader2, CheckCircle, AlertCircle, Phone, MapPin, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EmployeeProfile {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  role: string;
  isActive: boolean;
  user: { email: string } | null;
}

interface EmployeeDocument {
  id: string;
  originalName: string;
  fileType: 'ID' | 'PASSPORT' | 'CV' | 'OTHER';
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { email: string } | null;
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Requis'),
    newPassword: z.string().min(6, 'Minimum 6 caractères'),
    confirmPassword: z.string().min(1, 'Requis'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

const emailSchema = z.object({
  currentPassword: z.string().min(1, 'Requis'),
  newEmail: z.string().email('Email valide requis'),
});
type EmailForm = z.infer<typeof emailSchema>;

// ── Constants ──────────────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = [
  { value: 'ID', label: "Carte d'identité" },
  { value: 'PASSPORT', label: 'Passeport' },
  { value: 'CV', label: 'CV' },
  { value: 'OTHER', label: 'Autre' },
] as const;

const DOC_TYPE_COLORS: Record<string, string> = {
  ID: 'bg-blue-100 text-blue-800',
  PASSPORT: 'bg-indigo-100 text-indigo-800',
  CV: 'bg-emerald-100 text-emerald-800',
  OTHER: 'bg-gray-100 text-gray-700',
};

// ── Inline feedback helpers ────────────────────────────────────────────────────

function Feedback({ ok, msg }: { ok: boolean; msg: string }) {
  if (!msg) return null;
  return (
    <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
      ok ? 'bg-green-50 text-green-700 border border-green-200'
         : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const isEmployee = user?.role === 'EMPLOYEE';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileType, setUploadFileType] = useState('OTHER');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState({ ok: false, msg: '' });

  // Section feedback
  const [profileMsg, setProfileMsg] = useState({ ok: false, msg: '' });
  const [pwdMsg, setPwdMsg] = useState({ ok: false, msg: '' });
  const [emailMsg, setEmailMsg] = useState({ ok: false, msg: '' });

  // ── Profile form ──────────────────────────────────────────────────────────

  const {
    register: regProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    formState: { errors: profileErrors, isSubmitting: profileLoading },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  // ── Password form ─────────────────────────────────────────────────────────

  const {
    register: regPwd,
    handleSubmit: handlePwd,
    reset: resetPwd,
    formState: { errors: pwdErrors, isSubmitting: pwdLoading },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  // ── Email form ────────────────────────────────────────────────────────────

  const {
    register: regEmail,
    handleSubmit: handleEmail,
    reset: resetEmail,
    formState: { errors: emailErrors, isSubmitting: emailLoading },
  } = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: profile, isLoading: profileLoading2 } = useQuery<EmployeeProfile>({
    queryKey: ['my-profile'],
    queryFn: () => api.get<EmployeeProfile>('/employees/me/profile').then((r) => r.data),
    enabled: isEmployee,
  });

  const { data: documents, isLoading: docsLoading } = useQuery<EmployeeDocument[]>({
    queryKey: ['my-documents', profile?.id],
    queryFn: () =>
      api.get<EmployeeDocument[]>(`/employees/${profile!.id}/documents`).then((r) => r.data),
    enabled: isEmployee && !!profile?.id,
  });

  // Pre-fill profile form when data loads
  useEffect(() => {
    if (profile) {
      const parts = profile.name.split(' ');
      resetProfile({
        firstName: profile.firstName ?? parts[0] ?? '',
        lastName:  profile.lastName  ?? parts.slice(1).join(' ') ?? '',
        phone:   profile.phone   ?? '',
        address: profile.address ?? '',
      });
    }
  }, [profile, resetProfile]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onProfileSubmit = async (data: ProfileForm) => {
    setProfileMsg({ ok: false, msg: '' });
    try {
      await api.patch('/employees/me/profile', data);
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setProfileMsg({ ok: true, msg: 'Profil mis à jour avec succès.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, msg: err.response?.data?.message || 'Erreur lors de la mise à jour.' });
    }
  };

  const onPasswordSubmit = async (data: PasswordForm) => {
    setPwdMsg({ ok: false, msg: '' });
    try {
      await api.patch('/auth/me/password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      resetPwd();
      setPwdMsg({ ok: true, msg: 'Mot de passe mis à jour avec succès.' });
    } catch (err: any) {
      setPwdMsg({ ok: false, msg: err.response?.data?.message || 'Erreur lors du changement.' });
    }
  };

  const onEmailSubmit = async (data: EmailForm) => {
    setEmailMsg({ ok: false, msg: '' });
    try {
      await api.patch('/auth/me/email', data);
      setEmailMsg({ ok: true, msg: 'Email mis à jour. Vous allez être déconnecté(e)…' });
      setTimeout(() => {
        logout();
        window.location.href = '/login';
      }, 2500);
    } catch (err: any) {
      setEmailMsg({ ok: false, msg: err.response?.data?.message || 'Erreur lors du changement d\'email.' });
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !profile) return;
    setIsUploading(true);
    setUploadMsg({ ok: false, msg: '' });
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('fileType', uploadFileType);
      await api.post(`/employees/${profile.id}/documents`, fd);
      queryClient.invalidateQueries({ queryKey: ['my-documents', profile.id] });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadMsg({ ok: true, msg: 'Document ajouté.' });
    } catch (err: any) {
      setUploadMsg({ ok: false, msg: err.response?.data?.message || 'Erreur upload.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    if (!profile) return;
    try {
      const res = await api.get(`/employees/${profile.id}/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', doc.originalName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erreur lors du téléchargement.');
    }
  };

  const handleDelete = async (docId: string) => {
    if (!profile) return;
    try {
      await api.delete(`/employees/${profile.id}/documents/${docId}`);
      queryClient.invalidateQueries({ queryKey: ['my-documents', profile.id] });
    } catch {
      alert('Erreur suppression.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      {isEmployee ? (
        /* ── Employee: full settings ──────────────────────────────────────── */
        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" /> Mon profil
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Lock className="w-4 h-4" /> Sécurité
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" /> Mes documents
            </TabsTrigger>
          </TabsList>

          {/* ── Profile tab ────────────────────────────────────────────────── */}
          <TabsContent value="profile">
            <Card className="p-6">
              {profileLoading2 ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <form onSubmit={handleProfile(onProfileSubmit)} className="space-y-5">
                  <h2 className="font-semibold text-gray-800">Informations personnelles</h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="s-fn">Prénom <span className="text-red-500">*</span></Label>
                      <Input id="s-fn" {...regProfile('firstName')}
                        className={profileErrors.firstName ? 'border-red-500' : ''} />
                      {profileErrors.firstName && (
                        <p className="text-xs text-red-600">{profileErrors.firstName.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="s-ln">Nom <span className="text-red-500">*</span></Label>
                      <Input id="s-ln" {...regProfile('lastName')}
                        className={profileErrors.lastName ? 'border-red-500' : ''} />
                      {profileErrors.lastName && (
                        <p className="text-xs text-red-600">{profileErrors.lastName.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="s-phone" className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-gray-400" /> Téléphone
                    </Label>
                    <Input id="s-phone" type="tel" {...regProfile('phone')} placeholder="+33 6 12 34 56 78" />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="s-addr" className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" /> Adresse
                    </Label>
                    <Input id="s-addr" {...regProfile('address')} placeholder="12 rue de la Paix, 75001 Paris" />
                  </div>

                  <Feedback ok={profileMsg.ok} msg={profileMsg.msg} />

                  <Button type="submit" disabled={profileLoading}>
                    {profileLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</> : 'Enregistrer'}
                  </Button>
                </form>
              )}
            </Card>
          </TabsContent>

          {/* ── Security tab ───────────────────────────────────────────────── */}
          <TabsContent value="security">
            <div className="space-y-5">
              {/* Change email */}
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" /> Changer d'adresse email
                </h2>
                <p className="text-sm text-gray-500">
                  Email actuel : <strong>{user?.email}</strong>
                </p>
                <form onSubmit={handleEmail(onEmailSubmit)} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-curpwd">Mot de passe actuel</Label>
                    <Input id="e-curpwd" type="password" {...regEmail('currentPassword')}
                      className={emailErrors.currentPassword ? 'border-red-500' : ''} />
                    {emailErrors.currentPassword && (
                      <p className="text-xs text-red-600">{emailErrors.currentPassword.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-newemail">Nouvel email</Label>
                    <Input id="e-newemail" type="email" {...regEmail('newEmail')} placeholder="nouveau@stp.fr"
                      className={emailErrors.newEmail ? 'border-red-500' : ''} />
                    {emailErrors.newEmail && (
                      <p className="text-xs text-red-600">{emailErrors.newEmail.message}</p>
                    )}
                  </div>
                  <Feedback ok={emailMsg.ok} msg={emailMsg.msg} />
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Après modification, vous serez automatiquement déconnecté(e).
                  </p>
                  <Button type="submit" variant="outline" disabled={emailLoading}>
                    {emailLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mise à jour…</> : 'Mettre à jour l\'email'}
                  </Button>
                </form>
              </Card>

              {/* Change password */}
              <Card className="p-6 space-y-4">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-500" /> Changer de mot de passe
                </h2>
                <form onSubmit={handlePwd(onPasswordSubmit)} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="p-cur">Mot de passe actuel</Label>
                    <Input id="p-cur" type="password" {...regPwd('currentPassword')}
                      className={pwdErrors.currentPassword ? 'border-red-500' : ''} />
                    {pwdErrors.currentPassword && (
                      <p className="text-xs text-red-600">{pwdErrors.currentPassword.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-new">Nouveau mot de passe</Label>
                    <Input id="p-new" type="password" {...regPwd('newPassword')} placeholder="Min. 6 caractères"
                      className={pwdErrors.newPassword ? 'border-red-500' : ''} />
                    {pwdErrors.newPassword && (
                      <p className="text-xs text-red-600">{pwdErrors.newPassword.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-confirm">Confirmer le mot de passe</Label>
                    <Input id="p-confirm" type="password" {...regPwd('confirmPassword')}
                      className={pwdErrors.confirmPassword ? 'border-red-500' : ''} />
                    {pwdErrors.confirmPassword && (
                      <p className="text-xs text-red-600">{pwdErrors.confirmPassword.message}</p>
                    )}
                  </div>
                  <Feedback ok={pwdMsg.ok} msg={pwdMsg.msg} />
                  <Button type="submit" disabled={pwdLoading}>
                    {pwdLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mise à jour…</> : 'Changer le mot de passe'}
                  </Button>
                </form>
              </Card>
            </div>
          </TabsContent>

          {/* ── Documents tab ──────────────────────────────────────────────── */}
          <TabsContent value="documents">
            <Card className="p-6 space-y-5">
              {/* Upload */}
              <div>
                <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-gray-500" /> Ajouter un document
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={uploadFileType} onValueChange={setUploadFileType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOC_TYPE_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fichier</Label>
                    <Input
                      ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                      className="cursor-pointer"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                {uploadFile && (
                  <p className="text-xs text-gray-600 mb-2 truncate">
                    Sélectionné : <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                <Feedback ok={uploadMsg.ok} msg={uploadMsg.msg} />
                <Button size="sm" className="mt-2" disabled={!uploadFile || isUploading} onClick={handleUpload}>
                  {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi…</> : <><Upload className="w-4 h-4 mr-2" />Envoyer</>}
                </Button>
              </div>

              {/* Document list */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Mes documents</h3>
                {docsLoading ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : !documents?.length ? (
                  <div className="text-center py-8 text-gray-400">
                    <FileText className="w-8 h-8 mx-auto mb-1 opacity-30" />
                    <p className="text-sm">Aucun document</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 border rounded-lg p-3 bg-gray-50">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.originalName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge className={`text-xs ${DOC_TYPE_COLORS[doc.fileType] ?? ''}`}>
                              {DOC_TYPE_OPTIONS.find((t) => t.value === doc.fileType)?.label ?? doc.fileType}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {new Date(doc.uploadedAt).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" title="Télécharger" onClick={() => handleDownload(doc)}>
                            <Download className="w-4 h-4 text-indigo-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Supprimer" onClick={() => handleDelete(doc.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        /* ── Admin / dispatcher: Security only ───────────────────────────── */
        <div className="space-y-5">
          <div className="space-y-5">
            {/* Change email */}
            <Card className="p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" /> Changer d'adresse email
              </h2>
              <p className="text-sm text-gray-500">
                Email actuel : <strong>{user?.email}</strong>
              </p>
              <form onSubmit={handleEmail(onEmailSubmit)} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ae-curpwd">Mot de passe actuel</Label>
                  <Input id="ae-curpwd" type="password" {...regEmail('currentPassword')}
                    className={emailErrors.currentPassword ? 'border-red-500' : ''} />
                  {emailErrors.currentPassword && (
                    <p className="text-xs text-red-600">{emailErrors.currentPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ae-newemail">Nouvel email</Label>
                  <Input id="ae-newemail" type="email" {...regEmail('newEmail')} placeholder="nouveau@stp.fr"
                    className={emailErrors.newEmail ? 'border-red-500' : ''} />
                  {emailErrors.newEmail && (
                    <p className="text-xs text-red-600">{emailErrors.newEmail.message}</p>
                  )}
                </div>
                <Feedback ok={emailMsg.ok} msg={emailMsg.msg} />
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Après modification, vous serez automatiquement déconnecté(e).
                </p>
                <Button type="submit" variant="outline" disabled={emailLoading}>
                  {emailLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />…</> : 'Mettre à jour l\'email'}
                </Button>
              </form>
            </Card>

            {/* Change password */}
            <Card className="p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-500" /> Changer de mot de passe
              </h2>
              <form onSubmit={handlePwd(onPasswordSubmit)} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ap-cur">Mot de passe actuel</Label>
                  <Input id="ap-cur" type="password" {...regPwd('currentPassword')}
                    className={pwdErrors.currentPassword ? 'border-red-500' : ''} />
                  {pwdErrors.currentPassword && (
                    <p className="text-xs text-red-600">{pwdErrors.currentPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ap-new">Nouveau mot de passe</Label>
                  <Input id="ap-new" type="password" {...regPwd('newPassword')} placeholder="Min. 6 caractères"
                    className={pwdErrors.newPassword ? 'border-red-500' : ''} />
                  {pwdErrors.newPassword && (
                    <p className="text-xs text-red-600">{pwdErrors.newPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ap-confirm">Confirmer</Label>
                  <Input id="ap-confirm" type="password" {...regPwd('confirmPassword')}
                    className={pwdErrors.confirmPassword ? 'border-red-500' : ''} />
                  {pwdErrors.confirmPassword && (
                    <p className="text-xs text-red-600">{pwdErrors.confirmPassword.message}</p>
                  )}
                </div>
                <Feedback ok={pwdMsg.ok} msg={pwdMsg.msg} />
                <Button type="submit" disabled={pwdLoading}>
                  {pwdLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />…</> : 'Changer le mot de passe'}
                </Button>
              </form>
            </Card>
          </div>

          {/* Placeholder for future admin settings */}
          <Card className="p-6 border-dashed">
            <p className="text-sm text-gray-400 text-center">
              D'autres paramètres système seront disponibles prochainement.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
