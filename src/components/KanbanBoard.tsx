"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const COLUNAS = [
  { id: 'novo', titulo: 'Novos Pacientes', dot: 'bg-blue-500' },
  { id: 'nao_respondeu', titulo: 'Não Respondeu', dot: 'bg-amber-500' },
  { id: 'agendado', titulo: 'Agendados (IA)', dot: 'bg-indigo-500' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-500' },
  { id: 'no_show', titulo: 'Faltou (No-Show)', dot: 'bg-red-500' },
  { id: 'na_clinica', titulo: 'Na Clínica', dot: 'bg-amber-500' },
  { id: 'vendido', titulo: 'Tratamento Fechado', dot: 'bg-teal-500' },
  { id: 'nao_vendido', titulo: 'Tratamento Não Fechado', dot: 'bg-rose-500' },
  { id: 'encerrado', titulo: 'Encerrados', dot: 'bg-slate-400' },
];

const LISTA_UNIDADES = ['Santo André', 'Diadema', 'Mauá', 'São Mateus'];

const GOOGLE_CALENDARS: Record<string, { id: string; color: string }> = {
  'Santo André': { id: 'e53816e5210cbd29f4e2d525f75e9fdbad0333c901a13d213e98d791e99b23b0%40group.calendar.google.com', color: '%23D50000' },
  'Diadema': { id: '205188e12762a447906c539183a8be8e191162831ea3526fced0b3d7a9bf31ff%40group.calendar.google.com', color: '%23F6BF26' },
  'Mauá': { id: '6d64444a84645cd3a6871595cc4f6b1929cdd13d175ef676b5c89f3e4ee265b5%40group.calendar.google.com', color: '%230B8043' },
  'São Mateus': { id: '84903b0600945eccd716d5c0b51a620758e8ea1c6dc7a8bfa75a0b498febfbec%40group.calendar.google.com', color: '%238E24AA' },
};

const OPCOES_PROCEDIMENTO_PADRAO = [
  'Não Informado', 'Avaliação para prótese dentária', 'Implante Dentário', 'Prótese Dentária',
  'Aparelho Ortodôntico', 'Avaliação Geral', 'Limpeza / Profilaxia', 'Clareamento Dentário',
  'Tratamento de Canal', 'Extração / Cirurgia'
];

const OPCOES_FEEDBACK_PADRAO = [
  'Não Informado', 'FECHOU', 'MARCOU RETORNO', 'ACHOU CARO', 'NÃO QUIZ',
  'SEM INTERESSE', 'VOU FALAR COM A FAMILIA', 'SEM DINHEIRO'
];

const getTempoCronologico = (lead: any) => {
  const data = lead['última_interação'] || lead.ultima_interacao || lead.created_at || lead.data_agendamento;
  return data ? new Date(data).getTime() : 0;
};

const getHorasParado = (lead: any): number => {
  const timeMs = getTempoCronologico(lead);
  if (!timeMs) return 0;
  return Math.floor((Date.now() - timeMs) / (1000 * 60 * 60));
};

const formatarTempoParado = (horas: number): string => {
  if (horas < 1) return 'Agora';
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  const restHoras = horas % 24;
  return restHoras > 0 ? `${dias}d ${restHoras}h` : `${dias}d`;
};

const formatarDataAgendamento = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const horas = date.getHours().toString().padStart(2, '0');
    const minutos = date.getMinutes().toString().padStart(2, '0');
    return `${dia}/${mes} às ${horas}:${minutos}`;
  } catch {
    return '';
  }
};

const formatarTelefone = (phone?: string | null): string => {
  if (!phone) return 'Sem Telefone';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13 && clean.startsWith('55')) {
    return `(${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  return phone;
};

const formatarMoeda = (val?: number | string | null): string => {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Motor de Precisão de Datas
const isWithinDateRange = (dateStr: string | null, range: string, customStart?: string, customEnd?: string) => {
  if (range === 'all') return true;
  if (!dateStr) return false;
  
  const leadDate = new Date(dateStr);
  if (isNaN(leadDate.getTime())) return false;

  const leadTime = leadDate.getTime();
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (range === 'today') return leadTime >= todayStart && leadTime <= todayEnd;

  if (range === 'yesterday') {
    const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
    return leadTime >= yStart && leadTime <= yEnd;
  }

  if (range === 'last_7') {
    const sevenDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    return leadTime >= sevenDaysAgoStart && leadTime <= todayEnd;
  }

  if (range === 'last_30') {
    const thirtyDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0).getTime();
    return leadTime >= thirtyDaysAgoStart && leadTime <= todayEnd;
  }

  if (range === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    return leadTime >= monthStart && leadTime <= monthEnd;
  }

  if (range === 'custom') {
    let startValid = true, endValid = true;
    if (customStart) {
      const [y, m, d] = customStart.split('-').map(Number);
      const s = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      startValid = leadTime >= s;
    }
    if (customEnd) {
      const [y, m, d] = customEnd.split('-').map(Number);
      const e = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      endValid = leadTime <= e;
    }
    return startValid && endValid;
  }

  return true;
};

export default function KanbanBoard({ onSelectLead, userProfile }: { onSelectLead?: (lead: any) => void; userProfile?: any }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'kanban' | 'analytics' | 'calendar'>('kanban');

  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    name: '',
    phone: '',
    unidade: 'Santo André',
    procedimento: 'Avaliação Geral',
    promotor: 'Passante de Rua',
    notas_internas: '',
    valor_venda: ''
  });

  const cargoNormalized = userProfile?.cargo?.toLowerCase().trim() || '';
  const isAdmin = cargoNormalized === 'admin' || cargoNormalized === 'administrador' || cargoNormalized === 'administrador geral';
  const userUnidade = userProfile?.unidade || 'all';

  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') {
      setUnidadeFilter(userUnidade);
      setNewPatientForm((prev) => ({ ...prev, unidade: userUnidade }));
    }
  }, [userProfile, isAdmin, userUnidade]);

  useEffect(() => {
    setIsBrowser(true);
    fetchLeads();
    const channel = supabase.channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from('dentup_leads').select('*');
    if (!error) setLeads(data || []);
  };

  const handleDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const newStatus = destination.droppableId;
    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, status: newStatus } : l)));
    await supabase.from('dentup_leads').update({ status: newStatus }).eq('id', draggableId);
  };

  const handleUpdateLead = async (campo: string, valor: any) => {
    if (!leadDrawer) return;
    const updatedDrawer = { ...leadDrawer, [campo]: valor };
    setLeadDrawer(updatedDrawer);
    setLeads((prev) => prev.map((l) => (l.id === leadDrawer.id ? { ...l, [campo]: valor } : l)));
    await supabase.from('dentup_leads').update({ [campo]: valor }).eq('id', leadDrawer.id);
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientForm.name || !newPatientForm.phone) {
      alert('Por favor, preencha o Nome e o WhatsApp do paciente.');
      return;
    }

    setSavingPatient(true);
    const payload = {
      name: newPatientForm.name,
      phone: newPatientForm.phone,
      unidade: newPatientForm.unidade,
      procedimento: newPatientForm.procedimento,
      promotor: newPatientForm.promotor,
      notas_internas: newPatientForm.notas_internas,
      valor_venda: newPatientForm.valor_venda ? Number(newPatientForm.valor_venda) : null,
      status: 'novo',
      is_paused: true,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('dentup_leads').insert([payload]).select();
    setSavingPatient(false);

    if (error) {
      alert('Erro ao cadastrar paciente: ' + error.message);
    } else {
      setIsNewPatientModalOpen(false);
      setNewPatientForm({
        name: '',
        phone: '',
        unidade: !isAdmin && userUnidade !== 'all' ? userUnidade : 'Santo André',
        procedimento: 'Avaliação Geral',
        promotor: 'Passante de Rua',
        notas_internas: '',
        valor_venda: ''
      });
      fetchLeads();
    }
  };

  const targetUnidade = (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') ? userUnidade : unidadeFilter;
  const leadsNoPeriodo = leads.filter((lead) => isWithinDateRange(lead.created_at || lead.ultima_interacao || lead['última_interação'], dateRange, customStart, customEnd));
  
  const leadsNaUnidade = leadsNoPeriodo.filter((lead) => {
    if (targetUnidade === 'all' || targetUnidade === 'Todas') return true;
    const leadUnid = lead.unidade || lead.unit || 'Pendente';
    return leadUnid.toLowerCase() === targetUnidade.toLowerCase();
  });

  const leadsFiltrados = leadsNaUnidade.filter((lead) => {
    const termo = searchTerm.toLowerCase().trim();
    return (lead.name || '').toLowerCase().includes(termo) || (lead.phone || lead.phone_number || '').toLowerCase().includes(termo);
  });

  // METRICAS DE CONVERSAO CUMULATIVA E FINANCEIRAS
  const totalLeads = leadsNaUnidade.length;
  const totalEstagnados = leadsNaUnidade.filter(l => getHorasParado(l) >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(l.status)).length;
  const agendados = leadsNaUnidade.filter(l => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status)).length;
  const confirmados = leadsNaUnidade.filter(l => ['confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status)).length;
  const compareceram = leadsNaUnidade.filter(l => ['na_clinica', 'vendido', 'nao_vendido'].includes(l.status)).length;
  const vendidos = leadsNaUnidade.filter(l => l.status === 'vendido').length;

  const faturamentoTotal = leadsNaUnidade
    .filter(l => l.status === 'vendido')
    .reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0);

  const taxaAgendamento = totalLeads > 0 ? ((agendados / totalLeads) * 100).toFixed(1) : '0.0';
  const taxaConfirmacao = agendados > 0 ? ((confirmados / agendados) * 100).toFixed(1) : '0.0';
  const taxaComparecimento = confirmados > 0 ? ((compareceram / confirmados) * 100).toFixed(1) : '0.0';
  const taxaFechamento = compareceram > 0 ? ((vendidos / compareceram) * 100).toFixed(1) : '0.0';
  const taxaConversaoGlobal = totalLeads > 0 ? ((vendidos / totalLeads) * 100).toFixed(1) : '0.0';

  const getGoogleCalendarUrl = () => {
    const baseUrl = "https://calendar.google.com/calendar/embed?ctz=America%2FSao_Paulo&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=1&showTz=0&mode=WEEK";
    if (targetUnidade !== 'all' && targetUnidade !== 'Todas' && GOOGLE_CALENDARS[targetUnidade]) {
      const cal = GOOGLE_CALENDARS[targetUnidade];
      return `${baseUrl}&src=${cal.id}&color=${cal.color}`;
    }
    const allSources = Object.values(GOOGLE_CALENDARS).map(cal => `&src=${cal.id}&color=${cal.color}`).join('');
    return `${baseUrl}${allSources}`;
  };

  if (!isBrowser) return null;

  const procedimentoAtual = leadDrawer?.procedimento || 'Não Informado';
  const opcoesProcedimento = OPCOES_PROCEDIMENTO_PADRAO.includes(procedimentoAtual) ? OPCOES_PROCEDIMENTO_PADRAO : [procedimentoAtual, ...OPCOES_PROCEDIMENTO_PADRAO];
  const feedbackAtual = leadDrawer?.feedback || 'Não Informado';
  const opcoesFeedback = OPCOES_FEEDBACK_PADRAO.includes(feedbackAtual) ? OPCOES_FEEDBACK_PADRAO : [feedbackAtual, ...OPCOES_FEEDBACK_PADRAO];

  const procsCount: Record<string, number> = {};
  leadsNaUnidade.forEach(l => {
    const p = l.procedimento || 'Não Informado';
    procsCount[p] = (procsCount[p] || 0) + 1;
  });

  const gerarDadosEvolucaoDeterministica = () => {
    const now = new Date();
    const buckets: { label: string; total: number; agendados: number }[] = [];
    if (dateRange === 'today') {
      const horas = [8, 10, 12, 14, 16, 18, 20];
      horas.forEach((h) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h - 2, 0, 0).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).getTime();
        const label = `${h.toString().padStart(2, '0')}:00`;
        const leadsNoIntervalo = leadsNaUnidade.filter((l) => {
          const t = getTempoCronologico(l);
          return t >= start && t < end;
        });
        const agendadosNoIntervalo = leadsNoIntervalo.filter((l) => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status));
        buckets.push({ label, total: leadsNoIntervalo.length, agendados: agendadosNoIntervalo.length });
      });
    } else {
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
        const label = i === 0 ? 'Hoje' : `${diasSemana[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
        const leadsNoDia = leadsNaUnidade.filter((l) => {
          const t = getTempoCronologico(l);
          return t >= start && t <= end;
        });
        const agendadosNoDia = leadsNoDia.filter((l) => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status));
        buckets.push({ label, total: leadsNoDia.length, agendados: agendadosNoDia.length });
      }
    }
    return buckets;
  };

  const chartBuckets = gerarDadosEvolucaoDeterministica();
  const svgWidth = 600, svgHeight = 200, paddingX = 40, paddingY = 30;
  const plotWidth = svgWidth - paddingX * 2, plotHeight = svgHeight - paddingY * 2;
  const maxVal = Math.max(...chartBuckets.map((b) => b.total), 5);
  const pointsTotal = chartBuckets.map((b, idx) => ({ x: paddingX + idx * (plotWidth / (chartBuckets.length - 1)), y: paddingY + plotHeight - (b.total / maxVal) * plotHeight, val: b.total }));
  const pointsAgendados = chartBuckets.map((b, idx) => ({ x: paddingX + idx * (plotWidth / (chartBuckets.length - 1)), y: paddingY + plotHeight - (b.agendados / maxVal) * plotHeight, val: b.agendados }));
  
  const generateLinePath = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const generateAreaPath = (pts: { x: number; y: number }[]) => {
    const line = generateLinePath(pts);
    const lastX = pts[pts.length - 1].x.toFixed(1), firstX = pts[0].x.toFixed(1), bottomY = (paddingY + plotHeight).toFixed(1);
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-800 font-sans">
      
      {/* HEADER EM DUAS CAMADAS */}
      <div className="bg-white border-b border-slate-200/80 z-10 sticky top-0 shadow-sm">
        
        {/* LINHA 1: NAVEGAÇÃO E AÇÕES */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-slate-100 gap-4 flex-wrap">
          
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button 
              onClick={() => setActiveTab('kanban')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              <span>Quadro CRM</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Analytics</span>
            </button>
            <button 
              onClick={() => setActiveTab('calendar')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Agenda</span>
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={() => setIsNewPatientModalOpen(true)} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm hover:shadow flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              <span>Novo Paciente</span>
            </button>

            <select 
              disabled={!isAdmin && userUnidade !== 'Todas' && userUnidade !== 'all'} 
              value={targetUnidade} 
              onChange={(e) => setUnidadeFilter(e.target.value)} 
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-semibold outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Todas as Unidades</option>
              {LISTA_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>

            {activeTab !== 'calendar' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select 
                  value={dateRange} 
                  onChange={(e) => setDateRange(e.target.value)} 
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="this_month">Este Mês</option>
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="last_7">Últimos 7 dias</option>
                  <option value="all">Todo o Período</option>
                  <option value="custom">Personalizado</option>
                </select>

                {dateRange === 'custom' && (
                  <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
                    <input 
                      type="date" 
                      value={customStart} 
                      onChange={(e) => setCustomStart(e.target.value)} 
                      className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                    />
                    <span className="text-[11px] font-bold text-slate-400">até</span>
                    <input 
                      type="date" 
                      value={customEnd} 
                      onChange={(e) => setCustomEnd(e.target.value)} 
                      className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                    />
                  </div>
                )}

                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Buscar paciente..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 w-44 shadow-inner" 
                  />
                  <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LINHA 2: BANNER DE METRICAS DO FUNIL COM DESTAQUE FINANCEIRO */}
        <div className="px-6 py-3 bg-slate-50/70 flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar">
          
          <div className="flex items-center gap-6 md:gap-8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leads Totais</span>
                <span className="text-xl md:text-2xl font-black text-slate-800 leading-tight">{totalLeads}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Agendados (IA)</span>
                  <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full">{taxaAgendamento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-indigo-600 leading-tight">{agendados}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Confirmados</span>
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-full">{taxaConfirmacao}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-emerald-600 leading-tight">{confirmados}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Na Clínica</span>
                  <span className="text-[10px] font-extrabold bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded-full">{taxaComparecimento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-amber-600 leading-tight">{compareceram}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Vendas Fechadas</span>
                  <span className="text-[10px] font-extrabold bg-teal-100 text-teal-700 px-1.5 py-0.2 rounded-full">{taxaFechamento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-teal-600 leading-tight">{vendidos}</span>
              </div>
            </div>

            {/* CARD DE FATURAMENTO TOTAL EM R$ */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse"></div>
              <div>
                <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Faturamento Total</span>
                <span className="text-xl md:text-2xl font-black text-emerald-600 leading-tight">{formatarMoeda(faturamentoTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                SLA Parado (+24h)
              </span>
              <span className="text-lg font-extrabold text-red-600">{totalEstagnados}</span>
            </div>
          </div>

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* VIEW 1: QUADRO KANBAN */}
        {activeTab === 'kanban' && (
          <div className="flex-1 overflow-x-auto p-6 custom-scrollbar">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-6 h-full items-start">
                {COLUNAS.map((coluna) => {
                  const leadsDaColuna = leadsFiltrados.filter((l) => (l.status || 'novo') === coluna.id).sort((a, b) => getTempoCronologico(b) - getTempoCronologico(a));
                  return (
                    <Droppable droppableId={coluna.id} key={coluna.id}>
                      {(provided, snapshot) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className={`flex-shrink-0 w-[340px] flex flex-col max-h-full rounded-xl bg-slate-100/80 border border-slate-200 p-3 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200 border-blue-300' : ''}`}>
                          <div className="mb-4 px-2 flex justify-between items-center pt-1">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${coluna.dot} shadow-sm`}></div>
                              <h3 className="font-bold text-slate-800 text-base">{coluna.titulo}</h3>
                            </div>
                            <span className="text-slate-600 text-sm font-semibold bg-slate-200 px-3 py-1 rounded-full">{leadsDaColuna.length}</span>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar min-h-[150px]">
                            {leadsDaColuna.map((lead, index) => {
                              const horasParado = getHorasParado(lead);
                              const isCritico = horasParado >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(coluna.id);
                              const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(coluna.id);

                              return (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                      onClick={() => setLeadDrawer(lead)}
                                      className={`p-4 rounded-xl border transition-all cursor-grab group bg-white ${
                                        snapshot.isDragging ? 'border-blue-500 shadow-xl z-50 scale-[1.02]' : 
                                        isCritico ? 'border-red-300 bg-red-50 hover:border-red-400 shadow-sm' : 
                                        isAlerta ? 'border-amber-300 bg-amber-50 hover:border-amber-400 shadow-sm' : 
                                        'border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md'
                                      }`}
                                      style={{ ...provided.draggableProps.style }}
                                    >
                                      <div className="flex justify-between items-start mb-1.5 gap-2">
                                        <h4 className="font-semibold text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">{lead.name || 'Sem Nome'}</h4>
                                        {lead.is_paused && <span className="text-xs bg-slate-800 text-white px-2 py-1 rounded-md font-medium shrink-0 shadow-sm">Humano</span>}
                                      </div>
                                      
                                      <p className="text-xs font-medium text-slate-500 mb-2">
                                        {formatarTelefone(lead.phone || lead.phone_number)}
                                      </p>
                                      
                                      {lead.promotor && (
                                        <p className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit mb-2">
                                          👤 Origem: {lead.promotor}
                                        </p>
                                      )}

                                      {/* BADGE DE VALOR DE VENDA NO CARD DO KANBAN */}
                                      {lead.valor_venda && Number(lead.valor_venda) > 0 && (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md mb-2 w-fit">
                                          💰 {formatarMoeda(lead.valor_venda)}
                                        </div>
                                      )}

                                      {lead.data_agendamento && (
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50/90 border border-indigo-100/80 px-2.5 py-1 rounded-lg mb-2.5 w-fit">
                                          <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          <span>{formatarDataAgendamento(lead.data_agendamento)}</span>
                                        </div>
                                      )}

                                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                        <span className="text-xs text-slate-600 font-medium bg-slate-100 px-2 py-1 rounded-md">{lead.unidade !== 'Pendente' ? lead.unidade : 'Sem Unidade'}</span>
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1.5 ${
                                          isCritico ? 'bg-red-100 text-red-700' : 
                                          isAlerta ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {isCritico && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                                          {formatarTempoParado(horasParado)}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </DragDropContext>
          </div>
        )}

        {/* VIEW 2: DASHBOARD DE ANALYTICS COM RESUMO FINANCEIRO */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar bg-[#F8FAFC]">
            <div className="max-w-7xl mx-auto space-y-10">
              
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="mb-8 flex justify-between items-end border-b border-slate-100 pb-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">Funil da Jornada do Paciente</h3>
                    <p className="text-xs text-slate-500 mt-1">Acompanhamento de conversão cumulativa ponta a ponta</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Dados atualizados em tempo real</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                  
                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-all shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div className="p-2.5 bg-slate-200/60 rounded-lg text-slate-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etapa 1</span>
                    </div>
                    <div>
                      <span className="text-3xl font-black text-slate-900 tracking-tight block">{totalLeads}</span>
                      <span className="text-xs font-semibold text-slate-500 mt-1 block">Leads Registrados</span>
                    </div>
                  </div>

                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-5 flex flex-col justify-between hover:border-indigo-200 transition-all shadow-sm relative">
                    <div className="flex justify-between items-center mb-4">
                      <div className="p-2.5 bg-indigo-100/80 rounded-lg text-indigo-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-md">{taxaAgendamento}%</span>
                    </div>
                    <div>
                      <span className="text-3xl font-black text-indigo-700 tracking-tight block">{agendados}</span>
                      <span className="text-xs font-semibold text-indigo-900/70 mt-1 block">Agendados pela IA</span>
                    </div>
                  </div>

                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-5 flex flex-col justify-between hover:border-emerald-200 transition-all shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div className="p-2.5 bg-emerald-100/80 rounded-lg text-emerald-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-md">{taxaConfirmacao}%</span>
                    </div>
                    <div>
                      <span className="text-3xl font-black text-emerald-700 tracking-tight block">{confirmados}</span>
                      <span className="text-xs font-semibold text-emerald-900/70 mt-1 block">Confirmados</span>
                    </div>
                  </div>

                  <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-5 flex flex-col justify-between hover:border-amber-200 transition-all shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div className="p-2.5 bg-amber-100/80 rounded-lg text-amber-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h5m-5 0V11m0 0h5" /></svg>
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">{taxaComparecimento}%</span>
                    </div>
                    <div>
                      <span className="text-3xl font-black text-amber-700 tracking-tight block">{compareceram}</span>
                      <span className="text-xs font-semibold text-amber-900/70 mt-1 block">Compareceram</span>
                    </div>
                  </div>

                  <div className="bg-teal-50/50 border border-teal-200/80 rounded-xl p-5 flex flex-col justify-between hover:border-teal-300 transition-all shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <div className="p-2.5 bg-teal-100 rounded-lg text-teal-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md">{taxaFechamento}%</span>
                    </div>
                    <div>
                      <span className="text-3xl font-black text-teal-700 tracking-tight block">{vendidos}</span>
                      <span className="text-xs font-semibold text-teal-900/70 mt-1 block">Vendas Fechadas</span>
                    </div>
                  </div>

                </div>

                <div className="mt-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 text-white flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Faturamento do Período</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Soma total das vendas de tratamentos fechados no período selecionado.</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-5 py-2 rounded-xl shrink-0">
                    {formatarMoeda(faturamentoTotal)}
                  </div>
                </div>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-7 shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Evolução de Atendimentos</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Leads vs. Agendamentos no tempo</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-blue-600"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Novos Leads</span>
                      <span className="flex items-center gap-1.5 text-emerald-600"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Agendados</span>
                    </div>
                  </div>

                  <div className="relative h-64 w-full flex items-end pt-4">
                    <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                      <defs>
                        <linearGradient id="blueGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#059669" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#F1F5F9" strokeDasharray="3 3" />
                      <line x1={paddingX} y1={paddingY + plotHeight / 2} x2={svgWidth - paddingX} y2={paddingY + plotHeight / 2} stroke="#F1F5F9" strokeDasharray="3 3" />
                      <line x1={paddingX} y1={paddingY + plotHeight} x2={svgWidth - paddingX} y2={paddingY + plotHeight} stroke="#E2E8F0" />

                      <path d={generateAreaPath(pointsTotal)} fill="url(#blueGlow)" />
                      <path d={generateLinePath(pointsTotal)} fill="none" stroke="#2563EB" strokeWidth="2.5" />

                      <path d={generateAreaPath(pointsAgendados)} fill="url(#emeraldGlow)" />
                      <path d={generateLinePath(pointsAgendados)} fill="none" stroke="#059669" strokeWidth="2.5" />

                      {pointsTotal.map((pt, i) => (
                        <g key={`total-pt-${i}`}>
                          <circle cx={pt.x} cy={pt.y} r="4" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
                          {pt.val > 0 && <text x={pt.x} y={pt.y - 10} textAnchor="middle" className="text-[10px] font-bold fill-blue-600">{pt.val}</text>}
                        </g>
                      ))}

                      {pointsAgendados.map((pt, i) => (
                        <g key={`agend-pt-${i}`}>
                          <circle cx={pt.x} cy={pt.y} r="4" fill="#059669" stroke="#FFFFFF" strokeWidth="2" />
                          {pt.val > 0 && <text x={pt.x} y={pt.y + 16} textAnchor="middle" className="text-[10px] font-bold fill-emerald-700">{pt.val}</text>}
                        </g>
                      ))}
                    </svg>
                  </div>
                  
                  <div className="flex justify-between text-xs font-medium text-slate-400 mt-4 border-t border-slate-100 pt-3 px-2">
                    {chartBuckets.map((b) => (
                      <span key={b.label}>{b.label}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-7 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Procedimentos Demanded</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Interesse primário dos pacientes</p>
                  </div>

                  <div className="my-6 flex justify-center items-center">
                    <div className="relative w-40 h-40 flex items-center justify-center rounded-full" style={{
                      background: `conic-gradient(#2563EB 0% 35%, #059669 35% 60%, #F59E0B 60% 80%, #6366F1 80% 100%)`
                    }}>
                      <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                        <span className="text-2xl font-black text-slate-900">{totalLeads}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Consultas</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs font-semibold">
                    {Object.entries(procsCount).slice(0, 4).map(([nome, qtd], idx) => {
                      const cores = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-indigo-500'];
                      const pct = totalLeads ? ((qtd / totalLeads) * 100).toFixed(0) : 0;
                      return (
                        <div key={nome} className="flex justify-between items-center p-1 rounded hover:bg-slate-50">
                          <span className="flex items-center gap-2 text-slate-700 truncate max-w-[170px]">
                            <span className={`w-2 h-2 rounded-full ${cores[idx % cores.length]}`}></span>
                            {nome}
                          </span>
                          <span className="text-slate-500 font-mono text-[11px]">{qtd} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 3: ABA DE CALENDÁRIO VISUAL */}
        {activeTab === 'calendar' && (
          <div className="flex-1 p-6 bg-[#F8FAFC] flex flex-col h-[calc(100vh-140px)] w-full">
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center bg-slate-50/50 gap-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Agenda Odontológica Integrada</h3>
                    <p className="text-xs text-slate-500">Exibindo unidade: <strong className="text-blue-600">{targetUnidade === 'all' ? 'Todas as Unidades' : targetUnidade}</strong></p>
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#D50000]"></span> Santo André</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#F6BF26]"></span> Diadema</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0B8043]"></span> Mauá</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#8E24AA]"></span> São Mateus</span>
                  </div>

                  <a href={getGoogleCalendarUrl()} target="_blank" rel="noreferrer" className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-all border border-slate-200 flex items-center gap-1.5 shadow-sm">
                    <span>↗ Expandir</span>
                  </a>
                </div>
              </div>

              <div className="flex-1 w-full h-full relative min-h-[500px]">
                <iframe src={getGoogleCalendarUrl()} style={{ border: 0 }} className="w-full h-full absolute inset-0" frameBorder="0" scrolling="no" title="Agenda Google Dentup"></iframe>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PARA CADASTRAR NOVO PACIENTE */}
        {isNewPatientModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">Novo Cadastro de Paciente</h3>
                <button onClick={() => setIsNewPatientModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
              </div>

              <form onSubmit={handleCreatePatient} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome do Paciente *</label>
                  <input type="text" required placeholder="Ex: Ana Maria Silva" value={newPatientForm.name} onChange={(e) => setNewPatientForm({ ...newPatientForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">WhatsApp / Telefone *</label>
                  <input type="text" required placeholder="Ex: 5511999998888" value={newPatientForm.phone} onChange={(e) => setNewPatientForm({ ...newPatientForm, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
                    <select disabled={!isAdmin && userUnidade !== 'all'} value={newPatientForm.unidade} onChange={(e) => setNewPatientForm({ ...newPatientForm, unidade: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:bg-slate-100">
                      {LISTA_UNIDADES.map((u) => (<option key={u} value={u}>{u}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
                    <select value={newPatientForm.procedimento} onChange={(e) => setNewPatientForm({ ...newPatientForm, procedimento: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white">
                      {OPCOES_PROCEDIMENTO_PADRAO.map((p) => (<option key={p} value={p}>{p}</option>))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Origem / Promotor</label>
                  <select value={newPatientForm.promotor} onChange={(e) => setNewPatientForm({ ...newPatientForm, promotor: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white font-medium text-slate-700">
                    <option value="Passante de Rua">Passante de Rua</option>
                    <option value="Promotor Marcos">Promotor Marcos</option>
                    <option value="Promotora Julia">Promotora Julia</option>
                    <option value="Divulgador">Divulgador</option>
                    <option value="Indicação de Amigo">Indicação de Amigo</option>
                    <option value="Panfleto Praça">Panfleto Praça</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Iniciais</label>
                  <textarea rows={3} placeholder="Ex: Paciente interessado em prótese rápida..." value={newPatientForm.notas_internas} onChange={(e) => setNewPatientForm({ ...newPatientForm, notas_internas: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white resize-none" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Valor Estimado/Venda (R$)</label>
                  <input type="number" step="0.01" placeholder="Ex: 2500.00" value={newPatientForm.valor_venda} onChange={(e) => setNewPatientForm({ ...newPatientForm, valor_venda: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white" />
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsNewPatientModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                  <button type="submit" disabled={savingPatient} className="px-5 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm transition-all disabled:opacity-50">{savingPatient ? 'Cadastrando...' : 'Salvar Paciente'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* GAVETA LATERAL DO CLIENTE - VALOR DA VENDA POSICIONADO POR ÚLTIMO */}
        {leadDrawer && (
          <>
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" onClick={() => setLeadDrawer(null)} />
            <div className="w-[450px] bg-white shadow-2xl flex flex-col z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Ficha do Paciente</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestão de Informações</p>
                </div>
                <button onClick={() => setLeadDrawer(null)} className="text-slate-400 hover:text-slate-700 text-xl font-light">✕</button>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome Completo</label>
                  <input type="text" value={leadDrawer.name || ''} onChange={(e) => setLeadDrawer({...leadDrawer, name: e.target.value})} onBlur={(e) => handleUpdateLead('name', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" />
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">WhatsApp</label>
                  <input type="text" readOnly value={formatarTelefone(leadDrawer.phone || leadDrawer.phone_number)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 outline-none cursor-not-allowed" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
                    <select value={leadDrawer.unidade || 'Pendente'} onChange={(e) => handleUpdateLead('unidade', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer">
                      {['Pendente', 'Santo André', 'Diadema', 'Mauá', 'São Mateus'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
                    <select value={procedimentoAtual} onChange={(e) => handleUpdateLead('procedimento', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer">
                      {opcoesProcedimento.map((p) => (<option key={p} value={p}>{p}</option>))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Feedback do Paciente</label>
                  <select value={feedbackAtual} onChange={(e) => handleUpdateLead('feedback', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm font-medium cursor-pointer">
                    {opcoesFeedback.map((f) => (<option key={f} value={f}>{f}</option>))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Promotor / Origem</label>
                  <input type="text" value={leadDrawer.promotor || ''} onChange={(e) => setLeadDrawer({...leadDrawer, promotor: e.target.value})} onBlur={(e) => handleUpdateLead('promotor', e.target.value)} placeholder="Ex: Passante de Rua..." className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Internas</label>
                  <textarea rows={4} value={leadDrawer.notas_internas || ''} onChange={(e) => setLeadDrawer({...leadDrawer, notas_internas: e.target.value})} onBlur={(e) => handleUpdateLead('notas_internas', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm" placeholder="Observações do atendimento clínico..." />
                </div>

                {/* CAMPO DE VALOR DO TRATAMENTO / VENDA - POSICIONADO POR ÚLTIMO */}
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80">
                  <label className="text-xs font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                    <span>💰 Valor do Tratamento Fechado (R$)</span>
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="Ex: 3500.00" 
                    value={leadDrawer.valor_venda ?? ''} 
                    onChange={(e) => setLeadDrawer({...leadDrawer, valor_venda: e.target.value})} 
                    onBlur={(e) => handleUpdateLead('valor_venda', e.target.value ? Number(e.target.value) : null)} 
                    className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-extrabold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm" 
                  />
                  <span className="text-[10px] text-emerald-600 font-medium mt-1 block">
                    Este valor soma automaticamente no painel de faturamento.
                  </span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => handleUpdateLead('is_paused', !leadDrawer.is_paused)} className={`py-2.5 rounded-lg font-bold text-xs transition-colors border ${leadDrawer.is_paused ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}>
                    {leadDrawer.is_paused ? '▶ Retomar Robô (IA)' : '⏸️ Pausar IA (Assumir)'}
                  </button>
                  <button onClick={() => { if (onSelectLead) onSelectLead(leadDrawer); }} className="py-2.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all shadow-sm">
                    Abrir no Chat
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}} />
    </div>
  );
}