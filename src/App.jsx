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
} from 'lucide-react';
import {
  supabase,
  uploadEvidenceFile,
  getSignedEvidenceUrl,
} from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [totalWeeks, setTotalWeeks] = useState(16);
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

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showBimbinganModal, setShowBimbinganModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showWeeksModal, setShowWeeksModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { permission, requestPermission } = useNotifications(targets, supervisions);

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

      if (settingsRes.data) setTotalWeeks(settingsRes.data.total_internship_weeks);
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
    if (diff < 0) return { label: `Lewat ${Math.abs(diff)} Hari`, urgent: false, passed: true };
    if (diff === 0) return { label: 'Hari Ini!', urgent: true, passed: false };
    return { label: `H-${diff} Hari`, urgent: diff <= 7, passed: false };
  };

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

  const handleSaveTarget = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target);
    const payload = {
      user_id: session.user.id,
      title: formData.get('title'),
      category: formData.get('category'),
      target_date: formData.get('target_date'),
    };

    if (editingTarget) {
      await supabase.from('targets').update(payload).eq('id', editingTarget.id);
    } else {
      await supabase.from('targets').insert([payload]);
    }
    setSubmitting(false);
    setShowTargetModal(false);
    setEditingTarget(null);
    fetchAllData();
  };

  const handleDeleteTarget = async (id) => {
    if (!confirm('Hapus target ini?')) return;
    await supabase.from('targets').delete().eq('id', id);
    fetchAllData();
  };

  const handleSaveInternshipLog = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const files = formData.getAll('evidences').filter((f) => f && f.size > 0);
      const uploadedEvidences = [];

      for (const file of files) {
        const path = await uploadEvidenceFile(file, session.user.id, 'internship');
        uploadedEvidences.push({
          name: file.name,
          path,
          type: file.type,
        });
      }

      const payload = {
        user_id: session.user.id,
        week_number: Number(formData.get('week_number')),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        summary: formData.get('summary'),
        blockers: formData.get('blockers') || null,
        status: formData.get('status'),
        evidences: uploadedEvidences,
      };

      const { error } = await supabase
        .from('internship_logs')
        .upsert(payload, { onConflict: 'user_id,week_number' });

      if (error) throw error;
      setShowLogModal(false);
      fetchAllData();
    } catch (err) {
      alert('Gagal menyimpan log: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLogStatus = async (log) => {
    const nextStatus = log.status === 'completed' ? 'in_progress' : 'completed';
    await supabase.from('internship_logs').update({ status: nextStatus }).eq('id', log.id);
    fetchAllData();
  };

  const toggleMilestone = async (milestone) => {
    await supabase
      .from('thesis_milestones')
      .update({ is_completed: !milestone.is_completed })
      .eq('id', milestone.id);
    fetchAllData();
  };

  const handleAddSupervisor = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target);
    await supabase.from('supervisors').insert([
      {
        user_id: session.user.id,
        name: formData.get('name'),
        role: formData.get('role'),
      },
    ]);
    setSubmitting(false);
    setShowSupervisorModal(false);
    fetchAllData();
  };

  const handleSaveSupervision = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      const proofFile = formData.get('proof_file');
      let proofPath = null;
      let proofName = null;

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

      const { error } = await supabase.from('thesis_supervisions').insert([payload]);
      if (error) throw error;

      setShowBimbinganModal(false);
      fetchAllData();
    } catch (err) {
      alert('Gagal menyimpan bimbingan: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSupervisionStatus = async (item) => {
    const nextStatus = item.status === 'approved' ? 'pending_revision' : 'approved';
    await supabase
      .from('thesis_supervisions')
      .update({ status: nextStatus })
      .eq('id', item.id);
    fetchAllData();
  };

  const handleUpdateTotalWeeks = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const weeks = Number(formData.get('total_weeks'));
    await supabase
      .from('user_settings')
      .upsert({ user_id: session.user.id, total_internship_weeks: weeks });
    setTotalWeeks(weeks);
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

          {targets.length === 0 ? (
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
              {targets.map((target) => {
                const cd = getCountdown(target.target_date);
                const isInternship = target.category === 'internship';
                return (
                  <div
                    key={target.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5 ${
                            isInternship
                              ? 'bg-[#EEF2FF] text-[#6366F1]'
                              : 'bg-[#ECFDF5] text-[#10B981]'
                          }`}
                        >
                          {isInternship ? 'Magang / PKL' : 'Skripsi / TA'}
                        </span>
                        <h3 className="font-semibold text-slate-900 text-sm">{target.title}</h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingTarget(target);
                            setShowTargetModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTarget(target.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
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
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          cd.passed
                            ? 'bg-slate-100 text-slate-500'
                            : cd.urgent
                            ? 'bg-[#FFFBEB] text-[#F59E0B] border border-amber-200'
                            : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        {cd.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-[#6366F1]">
                  {internshipProgress.pct}%
                </span>
                <button
                  onClick={() => setShowWeeksModal(true)}
                  title="Atur Total Minggu"
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
              <button
                onClick={() => setShowLogModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6366F1] hover:bg-indigo-600 text-white text-xs font-medium rounded-xl transition"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Minggu Baru</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSupervisorModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Dosen</span>
                </button>
                <button
                  onClick={() => setShowBimbinganModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-medium rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Catat Bimbingan</span>
                </button>
              </div>
            )}
          </div>

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

          {activeTab === 'thesis' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 h-fit space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Checklist Tahapan Skripsi</h3>
                <p className="text-xs text-slate-500">
                  Centang tahapan yang selesai untuk memperbarui persentase otomatis.
                </p>
                <div className="divide-y divide-slate-100 pt-1">
                  {milestones.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggleMilestone(m)}
                      className="w-full py-2.5 flex items-start justify-between gap-2 text-left group"
                    >
                      <div className="flex items-start gap-2.5">
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
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                        {m.weight_percentage}%
                      </span>
                    </button>
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
            activeTab === 'internship' ? setShowLogModal(true) : setShowBimbinganModal(true)
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
                {submitting ? 'Menyimpan...' : 'Simpan Target'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Catat Kegiatan Magang Mingguan</h3>
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
                    defaultValue={internshipLogs.length + 1}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue="completed"
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
                  placeholder="Catatan kendala selama minggu ini"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unggah Bukti (Screenshot / PDF)
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
                {submitting ? 'Mengunggah & Menyimpan...' : 'Simpan Logbook'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showSupervisorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Tambah Dosen Pembimbing</h3>
              <button onClick={() => setShowSupervisorModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddSupervisor} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap & Gelar
                </label>
                <input
                  name="name"
                  required
                  placeholder="Contoh: Ahmad Fauzi, M.Kom."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
                <select
                  name="role"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                >
                  <option value="Pembimbing 1">Pembimbing 1</option>
                  <option value="Pembimbing 2">Pembimbing 2</option>
                  <option value="Pembimbing PKL">Pembimbing PKL</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Dosen'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showBimbinganModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Catat Riwayat Bimbingan</h3>
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
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue="pending_revision"
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
                  placeholder="Tuliskan poin revisi atau arahan dari dosen..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unggah Foto Lembar Kontrol Bimbingan / Bukti ACC
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
                {submitting ? 'Menyimpan...' : 'Simpan Bimbingan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showWeeksModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 shadow-xl">
            <h3 className="font-bold text-slate-900 mb-3">Target Total Minggu Magang</h3>
            <form onSubmit={handleUpdateTotalWeeks} className="space-y-4">
              <input
                type="number"
                name="total_weeks"
                min="1"
                max="52"
                required
                defaultValue={totalWeeks}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowWeeksModal(false)}
                  className="flex-1 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-medium text-white bg-[#6366F1] rounded-xl"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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