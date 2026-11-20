import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  LogOut,
  Trash2,
  Edit3,
  X,
  GraduationCap,
  Briefcase,
  UserPlus,
  Settings,
  ExternalLink,
  CheckSquare,
  Square,
  AlertCircle,
  AlertTriangle,
  Download,
} from 'lucide-react';
import {
  supabase,
  uploadEvidenceFile,
  getSignedEvidenceUrl,
} from './lib/supabase';
import { exportInternshipPdf, exportThesisPdf } from './lib/exportPdf';
import { useNotifications } from './hooks/useNotifications';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [totalWeeks, setTotalWeeks] = useState(16);
  const [internshipMeta, setInternshipMeta] = useState({
    company: '',
    role: '',
    mentor: '',
  });
  const [targets, setTargets] = useState([]);
  const [internshipLogs, setInternshipLogs] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [supervisions, setSupervisions] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [loadingData, setLoadingData] = useState(false);

  const [activeTab, setActiveTab] = useState('internship');
  const [selectedSupervisorFilter, setSelectedSupervisorFilter] = useState('all');
  const [previewFile, setPreviewFile] = useState(null);

  // Custom Center Pop-up Modal (Confirm & Alert)
  const [dialog, setDialog] = useState(null);

  // Modal & Editing States (Full CRUD)
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [existingEvidences, setExistingEvidences] = useState([]);
  const [removedEvidencePaths, setRemovedEvidencePaths] = useState([]);

  const [showBimbinganModal, setShowBimbinganModal] = useState(false);
  const [editingSupervision, setEditingSupervision] = useState(null);
  const [removeExistingProof, setRemoveExistingProof] = useState(false);

  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);

  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [editingSupervisor, setEditingSupervisor] = useState(null);

  const [showWeeksModal, setShowWeeksModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { permission, requestPermission } = useNotifications(targets, supervisions);

  const showAlert = (title, message, variant = 'primary') => {
    setDialog({
      type: 'alert',
      title,
      message,
      confirmText: 'Mengerti',
      variant,
    });
  };

  const showConfirm = ({ title, message, confirmText = 'Hapus', variant = 'danger', onConfirm }) => {
    setDialog({
      type: 'confirm',
      title,
      message,
      confirmText,
      variant,
      onConfirm,
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchAllData = async () => {
    if (!session?.user) return;
    setLoadingData(true);
    try {
      const [
        settingsRes,
        targetsRes,
        logsRes,
        milestonesRes,
        supervisorsRes,
        supervisionsRes,
      ] = await Promise.all([
        supabase.from('user_settings').select('*').single(),
        supabase.from('targets').select('*').order('target_date', { ascending: true }),
        supabase.from('internship_logs').select('*').order('week_number', { ascending: false }),
        supabase.from('thesis_milestones').select('*').order('order_index', { ascending: true }),
        supabase.from('supervisors').select('*').order('created_at', { ascending: true }),
        supabase
          .from('thesis_supervisions')
          .select('*, supervisors(name, role)')
          .order('supervision_date', { ascending: false }),
      ]);

      if (settingsRes.data) {
        setTotalWeeks(settingsRes.data.total_internship_weeks || 16);
      }
      setInternshipMeta({
        company: localStorage.getItem('gs_intern_company') || '',
        role: localStorage.getItem('gs_intern_role') || '',
        mentor: localStorage.getItem('gs_intern_mentor') || '',
      });

      if (targetsRes.data) setTargets(targetsRes.data);
      if (logsRes.data) setInternshipLogs(logsRes.data);
      if (milestonesRes.data) setMilestones(milestonesRes.data);
      if (supervisorsRes.data) setSupervisors(supervisorsRes.data);
      if (supervisionsRes.data) setSupervisions(supervisionsRes.data);

      const pathsToSign = [];
      logsRes.data?.forEach((log) => {
        log.evidences?.forEach((ev) => {
          if (ev.path) pathsToSign.push(ev.path);
        });
      });
      supervisionsRes.data?.forEach((sup) => {
        if (sup.proof_image_url) pathsToSign.push(sup.proof_image_url);
      });

      const urlMap = {};
      await Promise.all(
        pathsToSign.map(async (path) => {
          const url = await getSignedEvidenceUrl(path);
          if (url) urlMap[path] = url;
        })
      );
      setSignedUrls(urlMap);
    } catch (err) {
      console.error('Error memuat data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (session) fetchAllData();
  }, [session]);

  const internshipProgress = useMemo(() => {
    const completedCount = internshipLogs.filter((l) => l.status === 'completed').length;
    const pct = totalWeeks > 0 ? Math.min(100, Math.round((completedCount / totalWeeks) * 100)) : 0;
    return { completedCount, pct };
  }, [internshipLogs, totalWeeks]);

  const thesisProgress = useMemo(() => {
    const totalWeight = milestones.reduce((acc, m) => acc + m.weight_percentage, 0);
    const completedWeight = milestones
      .filter((m) => m.is_completed)
      .reduce((acc, m) => acc + m.weight_percentage, 0);
    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }, [milestones]);

  const getCountdown = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: 'Selesai', urgent: false, passed: true };
    if (diff === 0) return { label: 'Hari Ini!', urgent: true, passed: false };
    return { label: `H-${diff} Hari`, urgent: diff <= 7, passed: false };
  };

  const sortedTargets = useMemo(() => {
    return [...targets].sort((a, b) => {
      const aPassed = getCountdown(a.target_date).passed;
      const bPassed = getCountdown(b.target_date).passed;
      if (aPassed === bPassed) return 0;
      return aPassed ? 1 : -1;
    });
  }, [targets]);

  // ==================== AUTH ====================
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setSubmitting(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ==================== CRUD: TARGETS ====================
  const handleSaveTarget = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const payload = {
        user_id: session.user.id,
        title: formData.get('title'),
        category: formData.get('category'),
        target_date: formData.get('target_date'),
      };

      if (editingTarget) {
        const { error } = await supabase.from('targets').update(payload).eq('id', editingTarget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('targets').insert([payload]);
        if (error) throw error;
      }
      setShowTargetModal(false);
      setEditingTarget(null);
      fetchAllData();
    } catch (err) {
      showAlert('Gagal Menyimpan Target', err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTarget = (target) => {
    showConfirm({
      title: 'Hapus Target Jadwal?',
      message: `Target "${target.title}" akan dihapus permanen dari daftar countdown.`,
      confirmText: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('targets').delete().eq('id', target.id);
        if (error) showAlert('Gagal Menghapus', error.message, 'danger');
        else fetchAllData();
      },
    });
  };

  // ==================== CRUD: INTERNSHIP LOGS ====================
  const openCreateLogModal = () => {
    setEditingLog(null);
    setExistingEvidences([]);
    setRemovedEvidencePaths([]);
    setShowLogModal(true);
  };

  const openEditLogModal = (log) => {
    setEditingLog(log);
    setExistingEvidences(log.evidences || []);
    setRemovedEvidencePaths([]);
    setShowLogModal(true);
  };

  const handleRemoveExistingEvidence = (pathToRemove) => {
    setExistingEvidences((prev) => prev.filter((ev) => ev.path !== pathToRemove));
    setRemovedEvidencePaths((prev) => [...prev, pathToRemove]);
  };

  const handleSaveInternshipLog = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const files = formData.getAll('evidences').filter((f) => f && f.size > 0);
      const newlyUploaded = [];

      for (const file of files) {
        const path = await uploadEvidenceFile(file, session.user.id, 'internship');
        newlyUploaded.push({
          name: file.name,
          path,
          type: file.type,
        });
      }

      if (removedEvidencePaths.length > 0) {
        await supabase.storage.from('evidences').remove(removedEvidencePaths);
      }

      const finalEvidences = [...existingEvidences, ...newlyUploaded];

      const payload = {
        user_id: session.user.id,
        week_number: Number(formData.get('week_number')),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        summary: formData.get('summary'),
        blockers: formData.get('blockers') || null,
        status: formData.get('status'),
        evidences: finalEvidences,
      };

      if (editingLog) {
        const { error } = await supabase
          .from('internship_logs')
          .update(payload)
          .eq('id', editingLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('internship_logs')
          .upsert(payload, { onConflict: 'user_id,week_number' });
        if (error) throw error;
      }

      setShowLogModal(false);
      setEditingLog(null);
      fetchAllData();
    } catch (err) {
      showAlert('Gagal Menyimpan Logbook', err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInternshipLog = (log) => {
    showConfirm({
      title: `Hapus Logbook Week ${log.week_number}?`,
      message: 'Catatan aktivitas mingguan beserta file bukti yang terlampir akan dihapus permanen.',
      confirmText: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const paths = log.evidences?.map((ev) => ev.path).filter(Boolean) || [];
          if (paths.length > 0) {
            await supabase.storage.from('evidences').remove(paths);
          }

          const { error } = await supabase.from('internship_logs').delete().eq('id', log.id);
          if (error) throw error;

          fetchAllData();
        } catch (err) {
          showAlert('Gagal Menghapus Logbook', err.message, 'danger');
        }
      },
    });
  };

  const toggleLogStatus = async (log) => {
    const nextStatus = log.status === 'completed' ? 'in_progress' : 'completed';
    await supabase.from('internship_logs').update({ status: nextStatus }).eq('id', log.id);
    fetchAllData();
  };

  // ==================== CRUD: THESIS MILESTONES ====================
  const toggleMilestone = async (milestone) => {
    await supabase
      .from('thesis_milestones')
      .update({ is_completed: !milestone.is_completed })
      .eq('id', milestone.id);
    fetchAllData();
  };

  const handleSaveMilestone = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const payload = {
        user_id: session.user.id,
        title: formData.get('title'),
        weight_percentage: Number(formData.get('weight_percentage')),
        order_index: editingMilestone ? editingMilestone.order_index : milestones.length + 1,
      };

      if (editingMilestone) {
        const { error } = await supabase
          .from('thesis_milestones')
          .update(payload)
          .eq('id', editingMilestone.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('thesis_milestones')
          .insert([{ ...payload, is_completed: false }]);
        if (error) throw error;
      }
      setShowMilestoneModal(false);
      setEditingMilestone(null);
      fetchAllData();
    } catch (err) {
      showAlert('Gagal Menyimpan Tahapan', err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMilestone = (milestone) => {
    showConfirm({
      title: 'Hapus Tahapan Skripsi?',
      message: `Tahapan "${milestone.title}" (${milestone.weight_percentage}%) akan dihapus dari checklist.`,
      confirmText: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('thesis_milestones').delete().eq('id', milestone.id);
        if (error) showAlert('Gagal Menghapus', error.message, 'danger');
        else fetchAllData();
      },
    });
  };

  // ==================== CRUD: SUPERVISORS ====================
  const handleSaveSupervisor = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const payload = {
        user_id: session.user.id,
        name: formData.get('name'),
        role: formData.get('role'),
      };

      if (editingSupervisor) {
        const { error } = await supabase
          .from('supervisors')
          .update(payload)
          .eq('id', editingSupervisor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('supervisors').insert([payload]);
        if (error) throw error;
      }

      setEditingSupervisor(null);
      e.target.reset();
      fetchAllData();
    } catch (err) {
      showAlert('Gagal Menyimpan Data Dosen', err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSupervisor = (sup) => {
    showConfirm({
      title: 'Hapus Dosen Pembimbing?',
      message: `Data "${sup.name}" (${sup.role}) akan dihapus dari daftar pembimbing.`,
      confirmText: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('supervisors').delete().eq('id', sup.id);
        if (error) showAlert('Gagal Menghapus', error.message, 'danger');
        else fetchAllData();
      },
    });
  };

  // ==================== CRUD: THESIS SUPERVISIONS ====================
  const openCreateSupervisionModal = () => {
    setEditingSupervision(null);
    setRemoveExistingProof(false);
    setShowBimbinganModal(true);
  };

  const openEditSupervisionModal = (item) => {
    setEditingSupervision(item);
    setRemoveExistingProof(false);
    setShowBimbinganModal(true);
  };

  const handleSaveSupervision = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const proofFile = formData.get('proof_file');
      let proofPath = editingSupervision?.proof_image_url || null;
      let proofName = editingSupervision?.proof_file_name || null;

      if ((proofFile && proofFile.size > 0) || removeExistingProof) {
        if (editingSupervision?.proof_image_url) {
          await supabase.storage.from('evidences').remove([editingSupervision.proof_image_url]);
        }
        proofPath = null;
        proofName = null;
      }

      if (proofFile && proofFile.size > 0) {
        proofPath = await uploadEvidenceFile(proofFile, session.user.id, 'bimbingan');
        proofName = proofFile.name;
      }

      const payload = {
        user_id: session.user.id,
        supervisor_id: formData.get('supervisor_id') || null,
        supervision_date: formData.get('supervision_date'),
        notes: formData.get('notes'),
        status: formData.get('status'),
        proof_image_url: proofPath,
        proof_file_name: proofName,
      };

      if (editingSupervision) {
        const { error } = await supabase
          .from('thesis_supervisions')
          .update(payload)
          .eq('id', editingSupervision.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('thesis_supervisions').insert([payload]);
        if (error) throw error;
      }

      setShowBimbinganModal(false);
      setEditingSupervision(null);
      fetchAllData();
    } catch (err) {
      showAlert('Gagal Menyimpan Bimbingan', err.message, 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSupervision = (item) => {
    showConfirm({
      title: 'Hapus Riwayat Bimbingan?',
      message: 'Catatan bimbingan ini beserta foto lembar kontrol yang terlampir akan dihapus permanen.',
      confirmText: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        try {
          if (item.proof_image_url) {
            await supabase.storage.from('evidences').remove([item.proof_image_url]);
          }

          const { error } = await supabase.from('thesis_supervisions').delete().eq('id', item.id);
          if (error) throw error;

          fetchAllData();
        } catch (err) {
          showAlert('Gagal Menghapus Bimbingan', err.message, 'danger');
        }
      },
    });
  };

  const toggleSupervisionStatus = async (item) => {
    const nextStatus = item.status === 'approved' ? 'pending_revision' : 'approved';
    await supabase
      .from('thesis_supervisions')
      .update({ status: nextStatus })
      .eq('id', item.id);
    fetchAllData();
  };

  const handleUpdateInternshipSettings = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const weeks = Number(formData.get('total_weeks'));
    const company = formData.get('company')?.trim() || '';
    const role = formData.get('role')?.trim() || '';
    const mentor = formData.get('mentor')?.trim() || '';

    localStorage.setItem('gs_intern_company', company);
    localStorage.setItem('gs_intern_role', role);
    localStorage.setItem('gs_intern_mentor', mentor);

    await supabase
      .from('user_settings')
      .upsert({ user_id: session.user.id, total_internship_weeks: weeks });

    setTotalWeeks(weeks);
    setInternshipMeta({ company, role, mentor });
    setShowWeeksModal(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-pulse text-slate-500 font-medium">Memuat GradSpace...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-100 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-100 rounded-full blur-3xl opacity-60" />

        <div className="w-full max-w-[400px] bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-7 shadow-sm relative z-10">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3">
              <GraduationCap className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">GradSpace</h1>
            <p className="text-xs text-slate-500 mt-1">
              Personal Academic & Internship Tracker
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#6366F1] hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Memproses...' : 'Sign In to Dashboard'}
            </button>
          </form>

          <p className="text-[11px] text-center text-slate-400 mt-6">
            Private personal workspace • Protected access
          </p>
        </div>
      </div>
    );
  }

  const filteredSupervisions =
    selectedSupervisorFilter === 'all'
      ? supervisions
      : supervisions.filter((s) => s.supervisor_id === selectedSupervisorFilter);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-12">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight">GradSpace</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-400">
                PKL & Skripsi Tracker
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={requestPermission}
              title={
                permission === 'granted'
                  ? 'Notifikasi Pengingat Aktif'
                  : 'Aktifkan Notifikasi Pengingat'
              }
              className={`p-2 rounded-xl border transition relative ${
                permission === 'granted'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Bell className="w-4 h-4" />
              {permission !== 'granted' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>

            <button
              onClick={() => {
                setEditingTarget(null);
                setShowTargetModal(true);
              }}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-[#6366F1] hover:bg-indigo-600 text-white text-xs font-medium rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Target Baru</span>
            </button>

            <button
              onClick={handleLogout}
              title="Keluar"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-200 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* TARGETS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Target & Countdown Jadwal
            </h2>
            <button
              onClick={() => {
                setEditingTarget(null);
                setShowTargetModal(true);
              }}
              className="sm:hidden text-xs font-medium text-indigo-600 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Target
            </button>
          </div>

          {sortedTargets.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center">
              <p className="text-sm text-slate-500">
                Belum ada target tanggal (Seminar PKL, Sempro, atau Sidang).
              </p>
              <button
                onClick={() => setShowTargetModal(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Buat Target Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {sortedTargets.map((target) => {
                const cd = getCountdown(target.target_date);
                const isInternship = target.category === 'internship';
                return (
                  <div
                    key={target.id}
                    className={`border rounded-2xl p-4 flex flex-col justify-between transition ${
                      cd.passed
                        ? 'bg-slate-50/80 border-slate-200/80 opacity-85'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5 ${
                            cd.passed
                              ? 'bg-slate-200/70 text-slate-600'
                              : isInternship
                              ? 'bg-[#EEF2FF] text-[#6366F1]'
                              : 'bg-[#ECFDF5] text-[#10B981]'
                          }`}
                        >
                          {isInternship ? 'Magang / PKL' : 'Skripsi / TA'}
                        </span>
                        <h3
                          className={`font-semibold text-sm ${
                            cd.passed ? 'text-slate-500 line-through' : 'text-slate-900'
                          }`}
                        >
                          {target.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingTarget(target);
                            setShowTargetModal(true);
                          }}
                          title="Edit Target"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTarget(target)}
                          title="Hapus Target"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {new Date(target.target_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                          cd.passed
                            ? 'bg-[#ECFDF5] text-[#10B981] border border-emerald-200'
                            : cd.urgent
                            ? 'bg-[#FFFBEB] text-[#F59E0B] border border-amber-200'
                            : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        {cd.passed && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {cd.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* PROGRESS CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] text-[#6366F1] flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Progres Magang</h3>
                  <p className="text-xs text-slate-500">
                    {internshipProgress.completedCount} dari {totalWeeks} Minggu Selesai
                  </p>
                  {internshipMeta.company && (
                    <p className="text-[11px] font-medium text-indigo-600 mt-0.5 truncate max-w-[220px]">
                      {internshipMeta.company}
                      {internshipMeta.role ? ` • ${internshipMeta.role}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-[#6366F1]">
                  {internshipProgress.pct}%
                </span>
                <button
                  onClick={() => setShowWeeksModal(true)}
                  title="Pengaturan Progres Magang"
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-[#6366F1] rounded-full transition-all duration-500"
                style={{ width: `${internshipProgress.pct}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Progres Skripsi / TA</h3>
                  <p className="text-xs text-slate-500">
                    {milestones.filter((m) => m.is_completed).length} dari {milestones.length}{' '}
                    Tahapan Tercapai
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-[#10B981]">{thesisProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-[#10B981] rounded-full transition-all duration-500"
                style={{ width: `${thesisProgress}%` }}
              />
            </div>
          </div>
        </section>

        {/* TABS & CONTENT */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 bg-slate-200/70 rounded-xl">
              <button
                onClick={() => setActiveTab('internship')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'internship'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Logbook Magang Mingguan
              </button>
              <button
                onClick={() => setActiveTab('thesis')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'thesis'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bimbingan & Milestone Skripsi
              </button>
            </div>

            {activeTab === 'internship' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    exportInternshipPdf({
                      logs: internshipLogs,
                      totalWeeks,
                      completedCount: internshipProgress.completedCount,
                      pct: internshipProgress.pct,
                      meta: internshipMeta,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ekspor PDF</span>
                </button>
                <button
                  onClick={openCreateLogModal}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6366F1] hover:bg-indigo-600 text-white text-xs font-medium rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Catat Minggu Baru</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const activeSup = supervisors.find((s) => s.id === selectedSupervisorFilter);
                    exportThesisPdf({
                      supervisions: filteredSupervisions,
                      milestones,
                      thesisProgress,
                      filterLabel: activeSup
                        ? `${activeSup.role} — ${activeSup.name}`
                        : 'Semua Dosen Pembimbing',
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ekspor PDF</span>
                </button>
                <button
                  onClick={() => {
                    setEditingSupervisor(null);
                    setShowSupervisorModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Kelola Dosen</span>
                </button>
                <button
                  onClick={openCreateSupervisionModal}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-medium rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Catat Bimbingan</span>
                </button>
              </div>
            )}
          </div>

          {/* INTERNSHIP LOGS LIST */}
          {activeTab === 'internship' && (
            <div className="space-y-3">
              {loadingData ? (
                <div className="text-center py-10 text-xs text-slate-400">Memuat logbook...</div>
              ) : internshipLogs.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
                  <p className="text-sm text-slate-500">
                    Belum ada catatan kegiatan magang mingguan.
                  </p>
                </div>
              ) : (
                internshipLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-[#EEF2FF] text-[#6366F1] font-bold text-xs">
                          Week {log.week_number}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(log.start_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          –{' '}
                          {new Date(log.end_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleLogStatus(log)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                            log.status === 'completed'
                              ? 'bg-[#ECFDF5] text-[#10B981]'
                              : 'bg-[#FFFBEB] text-[#F59E0B]'
                          }`}
                        >
                          {log.status === 'completed' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5" /> In Progress
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => openEditLogModal(log)}
                          title="Edit Logbook"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteInternshipLog(log)}
                          title="Hapus Logbook"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                      {log.summary}
                    </p>

                    {log.blockers && (
                      <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100 text-xs text-slate-600">
                        <span className="font-semibold text-amber-700">Kendala / Catatan: </span>
                        {log.blockers}
                      </div>
                    )}

                    {log.evidences && log.evidences.length > 0 && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {log.evidences.map((ev, idx) => {
                          const url = signedUrls[ev.path];
                          const isPdf = ev.type?.includes('pdf') || ev.name?.endsWith('.pdf');
                          return (
                            <button
                              key={idx}
                              onClick={() => url && setPreviewFile({ url, name: ev.name, isPdf })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 transition"
                            >
                              {isPdf ? (
                                <FileText className="w-3.5 h-3.5 text-rose-500" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                              )}
                              <span className="max-w-[160px] truncate">{ev.name}</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* THESIS MILESTONES & SUPERVISIONS */}
          {activeTab === 'thesis' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 h-fit space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Checklist Tahapan Skripsi</h3>
                  <button
                    onClick={() => {
                      setEditingMilestone(null);
                      setShowMilestoneModal(true);
                    }}
                    title="Tambah Tahapan"
                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Centang tahapan selesai untuk menghitung progres otomatis.
                </p>
                <div className="divide-y divide-slate-100 pt-1">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="py-2.5 flex items-start justify-between gap-2 group"
                    >
                      <button
                        onClick={() => toggleMilestone(m)}
                        className="flex items-start gap-2.5 text-left flex-1"
                      >
                        {m.is_completed ? (
                          <CheckSquare className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-xs leading-snug ${
                            m.is_completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium'
                          }`}
                        >
                          {m.title}
                        </span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1">
                          {m.weight_percentage}%
                        </span>
                        <button
                          onClick={() => {
                            setEditingMilestone(m);
                            setShowMilestoneModal(true);
                          }}
                          title="Edit Tahapan"
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMilestone(m)}
                          title="Hapus Tahapan"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3">
                  <span className="text-xs font-medium text-slate-600">
                    Riwayat Bimbingan ({filteredSupervisions.length})
                  </span>
                  <select
                    value={selectedSupervisorFilter}
                    onChange={(e) => setSelectedSupervisorFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none"
                  >
                    <option value="all">Semua Dosen Pembimbing</option>
                    {supervisors.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.role} — {sup.name}
                      </option>
                    ))}
                  </select>
                </div>

                {filteredSupervisions.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
                    <p className="text-sm text-slate-500">
                      Belum ada riwayat bimbingan tercatat.
                    </p>
                  </div>
                ) : (
                  filteredSupervisions.map((item) => {
                    const proofUrl = signedUrls[item.proof_image_url];
                    const isPdf = item.proof_file_name?.toLowerCase().endsWith('.pdf');
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-900">
                              {new Date(item.supervision_date).toLocaleDateString('id-ID', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                            {item.supervisors && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {item.supervisors.role}:{' '}
                                <span className="font-medium text-slate-700">
                                  {item.supervisors.name}
                                </span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleSupervisionStatus(item)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                                item.status === 'approved'
                                  ? 'bg-[#ECFDF5] text-[#10B981]'
                                  : 'bg-[#FFFBEB] text-[#F59E0B]'
                              }`}
                            >
                              {item.status === 'approved' ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" /> ACC / Selesai
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5" /> Revisi Berjalan
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => openEditSupervisionModal(item)}
                              title="Edit Riwayat Bimbingan"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteSupervision(item)}
                              title="Hapus Riwayat Bimbingan"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                          {item.notes}
                        </p>

                        {item.proof_image_url && (
                          <div className="pt-1">
                            <button
                              onClick={() =>
                                proofUrl &&
                                setPreviewFile({
                                  url: proofUrl,
                                  name: item.proof_file_name || 'Bukti Bimbingan',
                                  isPdf,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 text-xs text-emerald-700 font-medium transition"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>Lihat Bukti Bimbingan ({item.proof_file_name})</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2.5 flex items-center justify-around z-30">
        <button
          onClick={() => setActiveTab('internship')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeTab === 'internship' ? 'text-[#6366F1]' : 'text-slate-500'
          }`}
        >
          <Briefcase className="w-5 h-5" />
          <span>Magang</span>
        </button>

        <button
          onClick={() =>
            activeTab === 'internship' ? openCreateLogModal() : openCreateSupervisionModal()
          }
          className="w-11 h-11 -mt-6 rounded-2xl bg-[#6366F1] text-white flex items-center justify-center shadow-md"
        >
          <Plus className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveTab('thesis')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeTab === 'thesis' ? 'text-[#10B981]' : 'text-slate-500'
          }`}
        >
          <GraduationCap className="w-5 h-5" />
          <span>Skripsi</span>
        </button>
      </nav>

      {/* CUSTOM CENTER POP-UP DIALOG (CONFIRM & ALERT) */}
      {dialog && (
        <div
          onClick={() => setDialog(null)}
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${
                dialog.variant === 'danger'
                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                  : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
              }`}
            >
              {dialog.variant === 'danger' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">{dialog.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{dialog.message}</p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              {dialog.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const action = dialog.onConfirm;
                  setDialog(null);
                  if (action) await action();
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-semibold transition shadow-sm ${
                  dialog.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#6366F1] hover:bg-indigo-600'
                }`}
              >
                {dialog.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TARGET */}
      {showTargetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">
                {editingTarget ? 'Edit Target' : 'Tambah Target Custom'}
              </h3>
              <button onClick={() => setShowTargetModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveTarget} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Target</label>
                <input
                  name="title"
                  required
                  defaultValue={editingTarget?.title}
                  placeholder="Contoh: Seminar PKL / Sempro / Sidang"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                <select
                  name="category"
                  defaultValue={editingTarget?.category || 'internship'}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                >
                  <option value="internship">Magang / PKL</option>
                  <option value="thesis">Skripsi / Tugas Akhir</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Target
                </label>
                <input
                  type="date"
                  name="target_date"
                  required
                  defaultValue={editingTarget?.target_date}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#6366F1] text-white text-sm font-medium rounded-xl"
              >
                {submitting ? 'Menyimpan...' : editingTarget ? 'Perbarui Target' : 'Simpan Target'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INTERNSHIP LOG (CREATE & EDIT) */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">
                {editingLog
                  ? `Edit Logbook Week ${editingLog.week_number}`
                  : 'Catat Kegiatan Magang Mingguan'}
              </h3>
              <button onClick={() => setShowLogModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveInternshipLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Minggu Ke-
                  </label>
                  <input
                    type="number"
                    name="week_number"
                    min="1"
                    required
                    defaultValue={editingLog ? editingLog.week_number : internshipLogs.length + 1}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingLog?.status || 'completed'}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  >
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    required
                    defaultValue={editingLog?.start_date}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    required
                    defaultValue={editingLog?.end_date}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ringkasan Aktivitas Mingguan
                </label>
                <textarea
                  name="summary"
                  rows="3"
                  required
                  defaultValue={editingLog?.summary}
                  placeholder="Contoh: Membuat test case modul X, melakukan regression testing..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kendala / Insight (Opsional)
                </label>
                <input
                  name="blockers"
                  defaultValue={editingLog?.blockers || ''}
                  placeholder="Catatan kendala selama minggu ini"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              {existingEvidences.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Lampiran Tersimpan
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {existingEvidences.map((ev, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700"
                      >
                        <span className="max-w-[160px] truncate">{ev.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingEvidence(ev.path)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {editingLog ? 'Tambah Bukti Baru (Opsional)' : 'Unggah Bukti (Screenshot / PDF)'}
                </label>
                <input
                  type="file"
                  name="evidences"
                  multiple
                  accept="image/*,.pdf"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-indigo-50 file:text-indigo-600 file:font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#6366F1] text-white text-sm font-medium rounded-xl"
              >
                {submitting
                  ? 'Mengunggah & Menyimpan...'
                  : editingLog
                  ? 'Perbarui Logbook'
                  : 'Simpan Logbook'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MILESTONES (CREATE & EDIT) */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">
                {editingMilestone ? 'Edit Tahapan Skripsi' : 'Tambah Tahapan Skripsi'}
              </h3>
              <button onClick={() => setShowMilestoneModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveMilestone} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Tahapan
                </label>
                <input
                  name="title"
                  required
                  defaultValue={editingMilestone?.title}
                  placeholder="Contoh: BAB IV - Hasil dan Pembahasan"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Bobot Persentase (%)
                </label>
                <input
                  type="number"
                  name="weight_percentage"
                  min="1"
                  max="100"
                  required
                  defaultValue={editingMilestone?.weight_percentage || 15}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Tahapan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUPERVISORS (CREATE, LIST, EDIT, DELETE) */}
      {showSupervisorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">
                {editingSupervisor ? 'Edit Dosen Pembimbing' : 'Kelola Dosen Pembimbing'}
              </h3>
              <button
                onClick={() => {
                  setShowSupervisorModal(false);
                  setEditingSupervisor(null);
                }}
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form
              key={editingSupervisor?.id || 'new'}
              onSubmit={handleSaveSupervisor}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap & Gelar
                </label>
                <input
                  name="name"
                  required
                  defaultValue={editingSupervisor?.name}
                  placeholder="Contoh: Ahmad Fauzi, M.Kom."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
                <select
                  name="role"
                  defaultValue={editingSupervisor?.role || 'Pembimbing 1'}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                >
                  <option value="Pembimbing 1">Pembimbing 1</option>
                  <option value="Pembimbing 2">Pembimbing 2</option>
                  <option value="Pembimbing PKL">Pembimbing PKL</option>
                </select>
              </div>
              <div className="flex gap-2">
                {editingSupervisor && (
                  <button
                    type="button"
                    onClick={() => setEditingSupervisor(null)}
                    className="px-4 py-2.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-xl"
                  >
                    Batal Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl"
                >
                  {submitting
                    ? 'Menyimpan...'
                    : editingSupervisor
                    ? 'Perbarui Dosen'
                    : 'Tambah Dosen'}
                </button>
              </div>
            </form>

            {supervisors.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Daftar Dosen Tersimpan</p>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {supervisors.map((sup) => (
                    <div
                      key={sup.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{sup.name}</p>
                        <p className="text-slate-500">{sup.role}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingSupervisor(sup)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupervisor(sup)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: BIMBINGAN (CREATE & EDIT) */}
      {showBimbinganModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">
                {editingSupervision ? 'Edit Riwayat Bimbingan' : 'Catat Riwayat Bimbingan'}
              </h3>
              <button onClick={() => setShowBimbinganModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSaveSupervision} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">Dosen Pembimbing</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBimbinganModal(false);
                      setEditingSupervisor(null);
                      setShowSupervisorModal(true);
                    }}
                    className="text-[11px] text-emerald-600 font-medium hover:underline"
                  >
                    + Tambah Dosen Baru
                  </button>
                </div>
                <select
                  name="supervisor_id"
                  required
                  defaultValue={editingSupervision?.supervisor_id || ''}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                >
                  <option value="">-- Pilih Dosen --</option>
                  {supervisors.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.role} — {sup.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Bimbingan
                  </label>
                  <input
                    type="date"
                    name="supervision_date"
                    required
                    defaultValue={
                      editingSupervision?.supervision_date ||
                      new Date().toISOString().split('T')[0]
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSupervision?.status || 'pending_revision'}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  >
                    <option value="pending_revision">Revisi Berjalan</option>
                    <option value="approved">ACC / Selesai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Revisi / Arahan Dosen
                </label>
                <textarea
                  name="notes"
                  rows="3"
                  required
                  defaultValue={editingSupervision?.notes}
                  placeholder="Tuliskan poin revisi atau arahan dari dosen..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              {editingSupervision?.proof_image_url && !removeExistingProof && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800">
                  <span className="truncate">
                    Bukti tersimpan: {editingSupervision.proof_file_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRemoveExistingProof(true)}
                    className="text-rose-600 hover:underline ml-2 shrink-0"
                  >
                    Hapus Bukti
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {editingSupervision
                    ? 'Ganti / Unggah Bukti Baru (Opsional)'
                    : 'Unggah Foto Lembar Kontrol Bimbingan / Bukti ACC'}
                </label>
                <input
                  type="file"
                  name="proof_file"
                  accept="image/*,.pdf"
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl"
              >
                {submitting
                  ? 'Menyimpan...'
                  : editingSupervision
                  ? 'Perbarui Bimbingan'
                  : 'Simpan Bimbingan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PENGATURAN PROGRES MAGANG */}
      {showWeeksModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Pengaturan Progres Magang</h3>
              <button onClick={() => setShowWeeksModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleUpdateInternshipSettings} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Total Minggu Magang
                </label>
                <input
                  type="number"
                  name="total_weeks"
                  min="1"
                  max="52"
                  required
                  defaultValue={totalWeeks}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Perusahaan / Instansi (Opsional)
                </label>
                <input
                  name="company"
                  defaultValue={internshipMeta.company}
                  placeholder="Contoh: PT Kodegiri Indonesia"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Posisi / Divisi (Opsional)
                </label>
                <input
                  name="role"
                  defaultValue={internshipMeta.role}
                  placeholder="Contoh: Manual QA Intern"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Pembimbing Lapangan (Opsional)
                </label>
                <input
                  name="mentor"
                  defaultValue={internshipMeta.mentor}
                  placeholder="Untuk kolom tanda tangan PDF"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWeeksModal(false)}
                  className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-medium text-white bg-[#6366F1] rounded-xl"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW FILE */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {previewFile.name}
              </span>
              <button onClick={() => setPreviewFile(null)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 flex items-center justify-center max-h-[80vh] overflow-auto">
              {previewFile.isPdf ? (
                <iframe src={previewFile.url} className="w-full h-[70vh] rounded-lg" />
              ) : (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[70vh] rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}