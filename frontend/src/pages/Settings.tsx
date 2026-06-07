import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, Lock, FileText, Upload, Download, Trash2,
  Loader2, CheckCircle, AlertCircle, Phone, MapPin, Mail, Info,
  Link, RefreshCw, CheckCircle2, Unlink, FileSpreadsheet,
} from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

interface GlobalPayRate {
  tourType: string;
  chauffeurRate: number;
  aideRate: number | null;
  updatedAt: string | null;
  updatedBy: { id: string; email: string } | null;
}

const TOUR_TYPES_ORDER = ['STANDARD', 'GV', 'INSTALL', 'MONO', 'SPECIAL'] as const;
const TOUR_TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  GV: 'GV',
  INSTALL: 'Install',
  MONO: 'Mono',
  SPECIAL: 'Spéciale',
};

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

// ── Google Sheets Card ─────────────────────────────────────────────────────────

function GoogleSheetsCard() {
  const queryClient = useQueryClient();
  const [sheet1, setSheet1] = useState('');
  const [sheet2, setSheet2] = useState('');
  const [urlMsg, setUrlMsg] = useState({ ok: false, msg: '' });
  const [callbackMsg, setCallbackMsg] = useState({ ok: false, msg: '' });

  // Read ?google=connected|error query params set by the OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get('google');
    if (google === 'connected') {
      const email = params.get('email') ?? '';
      setCallbackMsg({ ok: true, msg: `Compte Google connecté${email ? ` : ${email}` : ''}.` });
      queryClient.invalidateQueries({ queryKey: ['google-status'] });
      // Clean up the URL so the message doesn't reappear on refresh
      window.history.replaceState({}, '', '/settings');
    } else if (google === 'error') {
      const message = params.get('message') ?? 'Erreur de connexion Google.';
      setCallbackMsg({ ok: false, msg: message });
      window.history.replaceState({}, '', '/settings');
    }
  }, [queryClient]);

  const { data: status, isLoading } = useQuery<{
    connected: boolean; email: string | null; sheet1Url: string | null; sheet2Url: string | null;
  }>({
    queryKey: ['google-status'],
    queryFn: () => api.get('/settings/google/status').then((r) => r.data),
  });

  // Pre-fill URL fields when status loads
  useEffect(() => {
    if (status?.sheet1Url) setSheet1(status.sheet1Url);
    if (status?.sheet2Url) setSheet2(status.sheet2Url);
  }, [status?.sheet1Url, status?.sheet2Url]);

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/settings/google/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-status'] }),
  });

  const saveUrlsMutation = useMutation({
    mutationFn: () => api.patch('/settings/google/sheets', { url1: sheet1, url2: sheet2 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-status'] });
      setUrlMsg({ ok: true, msg: 'Liens enregistrés.' });
    },
    onError: (err: any) => setUrlMsg({ ok: false, msg: err?.response?.data?.message || 'Erreur.' }),
  });

  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-gray-500" /> Synchronisation Google Sheets
      </h2>

      {/* Info */}
      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Connectez le compte Google qui a accès aux feuilles Boulanger. Seul un token de lecture
          est stocké — jamais votre mot de passe. Vous pouvez changer de compte à tout moment.
        </span>
      </div>

      {/* Callback result message */}
      {callbackMsg.msg && <Feedback ok={callbackMsg.ok} msg={callbackMsg.msg} />}

      {/* Connection status */}
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : status?.connected ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4" />
            <span>Connecté : <strong>{status.email}</strong></span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            <Unlink className="w-3.5 h-3.5 mr-1" />
            Déconnecter
          </Button>
        </div>
      ) : (
        <a
          href={`${API_URL}/auth/google`}
          className="flex items-center justify-center gap-2 w-full border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Se connecter avec Google
        </a>
      )}

      {/* Sheet URLs */}
      <div className="space-y-3 pt-2 border-t">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Link className="w-3.5 h-3.5 text-gray-400" /> Liens des feuilles Boulanger
        </h3>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Feuille 1 (ex: Garonor)</Label>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheet1}
              onChange={(e) => setSheet1(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Feuille 2 (ex: Alfortville)</Label>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheet2}
              onChange={(e) => setSheet2(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
        <Feedback ok={urlMsg.ok} msg={urlMsg.msg} />
        <Button
          size="sm"
          onClick={() => { setUrlMsg({ ok: false, msg: '' }); saveUrlsMutation.mutate(); }}
          disabled={saveUrlsMutation.isPending || (!sheet1 && !sheet2)}
        >
          {saveUrlsMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</> : 'Enregistrer les liens'}
        </Button>
      </div>
    </Card>
  );
}

// ── Mail Config Card ───────────────────────────────────────────────────────────

function MailConfigCard() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [msg, setMsg] = useState({ ok: false, msg: '' });
  const [testMsg, setTestMsg] = useState({ ok: false, msg: '' });

  useQuery({
    queryKey: ['mail-config'],
    queryFn: () => api.get('/settings/mail').then((r) => r.data),
    onSuccess: (data: any) => {
      if (data.host) setHost(data.host);
      if (data.port) setPort(String(data.port));
      if (data.user) setUser(data.user);
      if (data.pass) setPass(data.pass);
      if (data.from) setFrom(data.from);
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: () => api.post('/settings/mail', { host, port: Number(port), user, pass, from }),
    onSuccess: () => setMsg({ ok: true, msg: 'Configuration email enregistrée.' }),
    onError: (err: any) => setMsg({ ok: false, msg: err?.response?.data?.message || 'Erreur.' }),
  });

  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2">
        <Mail className="w-4 h-4 text-gray-500" /> Configuration email (SMTP)
      </h2>

      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Pour Gmail : host = <strong>smtp.gmail.com</strong>, port = <strong>587</strong>.
          Activez la validation en 2 étapes sur votre compte Google puis créez un
          "Mot de passe d'application" sur <strong>myaccount.google.com/security</strong> — utilisez ce code de 16 caractères ici, pas votre vrai mot de passe.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Serveur SMTP</Label>
          <Input placeholder="smtp.gmail.com" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Port</Label>
          <Input type="number" placeholder="587" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Adresse email</Label>
        <Input type="email" placeholder="notifications@stp.fr" value={user} onChange={(e) => setUser(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Mot de passe / App Password</Label>
        <Input type="password" placeholder="••••••••••••••••" value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Adresse expéditeur (From)</Label>
        <Input type="email" placeholder="noreply@stp.fr" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>

      <Feedback ok={msg.ok} msg={msg.msg} />
      <Feedback ok={testMsg.ok} msg={testMsg.msg} />

      <Button
        size="sm"
        onClick={() => { setMsg({ ok: false, msg: '' }); saveMutation.mutate(); }}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</> : 'Enregistrer'}
      </Button>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

// ── Import manuel Card ────────────────────────────────────────────────────────

function ImportCard() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batch, setBatch] = useState<{ id: string; rowCount: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importMsg, setImportMsg] = useState({ ok: false, msg: '' });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<{ id: string; rowCount: number }>('/imports/upload', fd, {
        headers: { 'Content-Type': undefined },
      });
      return r.data;
    },
    onSuccess: (data) => {
      setBatch(data);
      setConfirmOpen(true);
    },
    onError: (err: any) => {
      setImportMsg({ ok: false, msg: err?.response?.data?.message || 'Erreur lors du chargement du fichier.' });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/imports/${batch!.id}/commit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours-active'] });
      queryClient.invalidateQueries({ queryKey: ['tours-history'] });
      setConfirmOpen(false);
      setBatch(null);
      setImportMsg({ ok: true, msg: 'Import terminé. Les tournées ont été ajoutées.' });
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      setImportMsg({ ok: false, msg: err?.response?.data?.message || 'Erreur lors de la validation.' });
    },
  });

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setImportMsg({ ok: false, msg: 'Seuls les fichiers .xlsx ou .xls sont acceptés.' });
      return;
    }
    setImportMsg({ ok: false, msg: '' });
    uploadMutation.mutate(file);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-gray-500" />
        <h2 className="font-semibold text-gray-800">Import manuel (backup)</h2>
      </div>
      <p className="text-xs text-gray-500">
        Utilisez cette option si la synchronisation Google Sheets n'est pas disponible.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-600">Glisser un fichier Excel ici</p>
        <p className="text-xs text-gray-400 mt-1">ou cliquer pour choisir (.xlsx, .xls)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>

      {uploadMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement du fichier…
        </div>
      )}

      <Feedback ok={importMsg.ok} msg={importMsg.msg} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l'import</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            <strong>{batch?.rowCount ?? 0} tournée{(batch?.rowCount ?? 0) !== 1 ? 's' : ''}</strong> trouvée{(batch?.rowCount ?? 0) !== 1 ? 's' : ''} dans ce fichier.
            Voulez-vous les importer ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setBatch(null); }}>
              Annuler
            </Button>
            <Button onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
              {commitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Import…</> : 'Confirmer l\'import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

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

  // Global pay rates state (admin only)
  const [globalRates, setGlobalRates] = useState<Record<string, { chauffeurRate: string; aideRate: string }>>({});
  const [globalRatesMeta, setGlobalRatesMeta] = useState<{ updatedAt: string | null; email: string | null }>({ updatedAt: null, email: null });
  const [globalRatesMsg, setGlobalRatesMsg] = useState({ ok: false, msg: '' });
  const [globalRatesSaving, setGlobalRatesSaving] = useState(false);

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

  const { data: globalPayRates, isLoading: globalRatesLoading } = useQuery<GlobalPayRate[]>({
    queryKey: ['global-pay-rates'],
    queryFn: () => api.get<GlobalPayRate[]>('/settings/pay-rates').then((r) => r.data),
    enabled: !isEmployee,
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

  useEffect(() => {
    if (!globalPayRates) return;
    const map: Record<string, { chauffeurRate: string; aideRate: string }> = {};
    let latestAt: string | null = null;
    let latestEmail: string | null = null;
    for (const r of globalPayRates) {
      map[r.tourType] = {
        chauffeurRate: String(r.chauffeurRate),
        aideRate: r.aideRate != null ? String(r.aideRate) : '',
      };
      if (r.updatedAt && (!latestAt || r.updatedAt > latestAt)) {
        latestAt = r.updatedAt;
        latestEmail = r.updatedBy?.email ?? null;
      }
    }
    setGlobalRates(map);
    setGlobalRatesMeta({ updatedAt: latestAt, email: latestEmail });
  }, [globalPayRates]);

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

  const handleSaveGlobalRates = async () => {
    setGlobalRatesSaving(true);
    setGlobalRatesMsg({ ok: false, msg: '' });
    try {
      const rates = TOUR_TYPES_ORDER.map((tt) => ({
        tourType: tt,
        chauffeurRate: parseFloat(globalRates[tt]?.chauffeurRate || '0') || 0,
        aideRate: globalRates[tt]?.aideRate !== '' ? parseFloat(globalRates[tt]?.aideRate || '') || null : null,
      }));
      await api.put('/settings/pay-rates', { rates });
      queryClient.invalidateQueries({ queryKey: ['global-pay-rates'] });
      setGlobalRatesMsg({ ok: true, msg: 'Tarifs enregistrés.' });
    } catch (err: any) {
      setGlobalRatesMsg({ ok: false, msg: err.response?.data?.message || 'Erreur enregistrement.' });
    } finally {
      setGlobalRatesSaving(false);
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
    <div className="w-full max-w-2xl space-y-4 md:space-y-6">
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

          {/* Google Sheets */}
          <GoogleSheetsCard />

          {/* Mail config */}
          <MailConfigCard />

          {/* Import manuel */}
          <ImportCard />

          {/* Global pay rates */}
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Tarifs par défaut</h2>
            <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Ces tarifs s'appliquent à tous les employés sans tarif personnalisé.
                Les journées déjà enregistrées ne sont pas modifiées.
              </span>
            </div>
            {globalRatesLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left py-2 font-medium">Type</th>
                      <th className="text-center py-2 font-medium">Chauffeur (€)</th>
                      <th className="text-center py-2 font-medium">Aide (€)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {TOUR_TYPES_ORDER.map((tt) => {
                      const isMono = tt === 'MONO';
                      const vals = globalRates[tt] ?? { chauffeurRate: '', aideRate: '' };
                      return (
                        <tr key={tt}>
                          <td className="py-2 font-medium">{TOUR_TYPE_LABELS[tt]}</td>
                          <td className="py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={vals.chauffeurRate}
                              onChange={(e) =>
                                setGlobalRates((prev) => ({
                                  ...prev,
                                  [tt]: { ...vals, chauffeurRate: e.target.value },
                                }))
                              }
                              className="w-20 border rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 text-center">
                            {isMono ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={vals.aideRate}
                                onChange={(e) =>
                                  setGlobalRates((prev) => ({
                                    ...prev,
                                    [tt]: { ...vals, aideRate: e.target.value },
                                  }))
                                }
                                className="w-20 border rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={handleSaveGlobalRates} disabled={globalRatesSaving}>
                    {globalRatesSaving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement...</>
                    ) : (
                      'Enregistrer les tarifs'
                    )}
                  </Button>
                </div>
                <Feedback ok={globalRatesMsg.ok} msg={globalRatesMsg.msg} />
                {globalRatesMeta.updatedAt && (
                  <p className="text-xs text-gray-400">
                    Dernière modification le{' '}
                    {new Date(globalRatesMeta.updatedAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}{' '}
                    par {globalRatesMeta.email ?? 'inconnu'}
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
