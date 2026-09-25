"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const COLUNAS = [
  { id: 'novo', titulo: 'Novos Pacientes', dot: 'bg-blue-500' },
  { id: 'agendado', titulo: 'Agendados (IA)', dot: 'bg-indigo-500' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-500' },
  { id: 'na_clinica', titulo: 'Na Clínica', dot: 'bg-amber-500' },
  { id: 'vendido', titulo: 'Tratamento Fechado', dot: 'bg-teal-500' },
  { id: 'no_show', titulo: 'Faltou (No-Show)', dot: 'bg-red-500' },
  { id: 'encerrado', titulo: 'Encerrados', dot: 'bg-gray-400' },
];

const LISTA_UNIDADES = ['Santo André', 'Diadema', 'Mauá', 'São Mateus'];

const OPCOES_PROCEDIMENTO_PADRAO = [
  'Não Informado',
  'Avaliação para prótese dentária',
  'Implante Dentário',
  'Prótese Dentária',
  'Aparelho Ortodôntico',
  'Avaliação Geral',
  'Limpeza / Profilaxia',
  'Clareamento Dentário',
  'Tratamento de Canal',
  'Extração / Cirurgia'
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

const isWithinDateRange = (dateStr: string | null, range: string, customStart?: string, customEnd?: string) => {
  if (range === 'all') return true;
  if (!dateStr) return false;
  const leadDate = new Date(dateStr);
  const now = new Date();

  if (range === 'today') return leadDate.toDateString() === now.toDateString();
  if (range === 'yesterday') {
    const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
    return leadDate.toDateString() === yesterday.toDateString();
  }
  if (range === 'last_7') {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(now.getDate() - 7);
    return leadDate >= sevenDaysAgo;
  }
  if (range === 'last_30') {
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(now.getDate() - 30);
    return leadDate >= thirtyDaysAgo;
  }
  if (range === 'this_month') return leadDate.getMonth() === now.getMonth() && leadDate.getFullYear() === now.getFullYear();
  if (range === 'custom') {
    if (!customStart && !customEnd) return true;
    const leadTime = new Date(leadDate.getFullYear(), leadDate.getMonth(), leadDate.getDate()).getTime();
    let startValid = true, endValid = true;
    if (customStart) startValid = leadTime >= new Date(customStart + 'T00:00:00').getTime();
    if (customEnd) endValid = leadTime <= new Date(customEnd + 'T23:59:59').getTime();
    return startValid && endValid;
  }
  return true;
};

export default function KanbanBoard({ onSelectLead, userProfile }: { onSelectLead?: (lead: any) => void; userProfile?: any }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'kanban' | 'analytics'>('kanban');

  // CHECAGEM E REGRAS DE SEGURANÇA POR UNIDADE
  const isAdmin = userProfile?.cargo?.toLowerCase() === 'admin' || userProfile?.cargo?.toLowerCase() === 'administrador';
  const userUnidade = userProfile?.unidade || 'all';

  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') {
      setUnidadeFilter(userUnidade);
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

  // DETERMINA A UNIDADE ALVO ATIVA (SE ATENDENTE, FORÇA A UNIDADE DELE)
  const targetUnidade = (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') ? userUnidade : unidadeFilter;

  // Filtros dinâmicos encadeados
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

  // Métricas dinâmicas respeitando período e unidade
  const totalLeads = leadsNaUnidade.length;
  const agendados = leadsNaUnidade.filter(l => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'no_show'].includes(l.status)).length;
  const confirmados = leadsNaUnidade.filter(l => l.status === 'confirmado').length;
  const naClinica = leadsNaUnidade.filter(l => l.status === 'na_clinica').length;
  const vendidos = leadsNaUnidade.filter(l => l.status === 'vendido').length;
  const taxaConversao = totalLeads > 0 ? ((agendados / totalLeads) * 100).toFixed(1) : '0.0';
  const totalEstagnados = leadsNaUnidade.filter(l => getHorasParado(l) >= 24 && l.status !== 'vendido' && l.status !== 'encerrado').length;

  if (!isBrowser) return null;

  const procedimentoAtual = leadDrawer?.procedimento || 'Não Informado';
  const opcoesProcedimento = OPCOES_PROCEDIMENTO_PADRAO.includes(procedimentoAtual)
    ? OPCOES_PROCEDIMENTO_PADRAO
    : [procedimentoAtual, ...OPCOES_PROCEDIMENTO_PADRAO];

  // Métricas do Dashboard de Procedimentos
  const procsCount: Record<string, number> = {};
  leadsNaUnidade.forEach(l => {
    const p = l.procedimento || 'Não Informado';
    procsCount[p] = (procsCount[p] || 0) + 1;
  });

  // =========================================================================
  // CÁLCULO DETERMINÍSTICO E DINÂMICO DO GRÁFICO DE EVOLUÇÃO
  // =========================================================================
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
        const agendadosNoIntervalo = leadsNoIntervalo.filter((l) =>
          ['agendado', 'confirmado', 'na_clinica', 'vendido', 'no_show'].includes(l.status)
        );

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
        const agendadosNoDia = leadsNoDia.filter((l) =>
          ['agendado', 'confirmado', 'na_clinica', 'vendido', 'no_show'].includes(l.status)
        );

        buckets.push({ label, total: leadsNoDia.length, agendados: agendadosNoDia.length });
      }
    }

    return buckets;
  };

  const chartBuckets = gerarDadosEvolucaoDeterministica();

  const svgWidth = 600;
  const svgHeight = 200;
  const paddingX = 40;
  const paddingY = 30;
  const plotWidth = svgWidth - paddingX * 2;
  const plotHeight = svgHeight - paddingY * 2;

  const maxVal = Math.max(...chartBuckets.map((b) => b.total), 5);

  const pointsTotal = chartBuckets.map((b, idx) => {
    const x = paddingX + idx * (plotWidth / (chartBuckets.length - 1));
    const y = paddingY + plotHeight - (b.total / maxVal) * plotHeight;
    return { x, y, val: b.total };
  });

  const pointsAgendados = chartBuckets.map((b, idx) => {
    const x = paddingX + idx * (plotWidth / (chartBuckets.length - 1));
    const y = paddingY + plotHeight - (b.agendados / maxVal) * plotHeight;
    return { x, y, val: b.agendados };
  });

  const generateLinePath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const generateAreaPath = (pts: { x: number; y: number }[]) => {
    const line = generateLinePath(pts);
    const lastX = pts[pts.length - 1].x.toFixed(1);
    const firstX = pts[0].x.toFixed(1);
    const bottomY = (paddingY + plotHeight).toFixed(1);
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  return (
    <div className="flex flex-col h-full bg-[#F4F6F8] text-slate-800 font-sans">
      
      {/* HEADER PRINCIPAL COM BOTÃO DE ALTERNÂNCIA (KANBAN VS ANALYTICS) */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex flex-wrap items-center justify-between z-10 sticky top-0 shadow-sm gap-6">
        
        <div className="flex items-center gap-8">
          {/* Seletor de Abas */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab('kanban')} 
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              📋 Quadro CRM
            </button>
            <button 
              onClick={() => setActiveTab('analytics')} 
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              📊 Analytics
            </button>
          </div>

          <div className="h-10 w-px bg-slate-200 hidden md:block"></div>

          {/* Métricas do Topo */}
          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pacientes Totais</span>
              <span className="text-2xl font-bold text-slate-800">{totalLeads}</span>
            </div>
            
            <div className="h-8 w-px bg-slate-200"></div>
            
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Agendados (IA)</span>
              <span className="text-2xl font-bold text-blue-600">{agendados}</span>
            </div>

            <div className="h-8 w-px bg-slate-200"></div>

            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Conversão (IA)</span>
              <span className="text-2xl font-bold text-emerald-600">{taxaConversao}%</span>
            </div>
            
            <div className="h-8 w-px bg-slate-200"></div>
            
            <div className="flex flex-col">
              <span className="text-xs text-red-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                SLA Crítico
              </span>
              <span className="text-2xl font-bold text-red-600">{totalEstagnados}</span>
            </div>
          </div>
        </div>

        {/* Filtros com trava por Unidade */}
        <div className="flex items-center gap-4">
          <select
            disabled={!isAdmin && userUnidade !== 'Todas' && userUnidade !== 'all'}
            value={targetUnidade}
            onChange={(e) => setUnidadeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed font-semibold"
          >
            <option value="all">Todas as Unidades</option>
            {LISTA_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            <option value="Pendente">Pendente</option>
          </select>

          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-700 outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="all">Todo o Período</option>
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="last_7">Últimos 7 dias</option>
            <option value="this_month">Este Mês</option>
            <option value="custom">Personalizado</option>
          </select>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-1.5">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none" />
              <span className="text-slate-400">-</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none" />
            </div>
          )}

          <div className="relative">
            <input type="text" placeholder="Buscar paciente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-white border border-slate-300 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-60 shadow-sm" />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* VIEW 1: QUADRO KANBAN */}
        {activeTab === 'kanban' ? (
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
                              const isCritico = horasParado >= 24 && !['vendido', 'encerrado'].includes(coluna.id);
                              const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'encerrado'].includes(coluna.id);

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
                                      <div className="flex justify-between items-start mb-2 gap-2">
                                        <h4 className="font-semibold text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">{lead.name || 'Sem Nome'}</h4>
                                        {lead.is_paused && <span className="text-xs bg-slate-800 text-white px-2 py-1 rounded-md font-medium shrink-0 shadow-sm">Humano</span>}
                                      </div>
                                      <p className="text-sm text-slate-500 mb-4">{lead.phone || lead.phone_number}</p>
                                      
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
        ) : (
          
          /* VIEW 2: DASHBOARD DE ANALYTICS DETERMINÍSTICO */
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#F4F6F8]">
            <div className="max-w-7xl mx-auto space-y-8">
              
              {/* ROW 1: CARDS DE KPIS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Agendamentos</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Real</span>
                  </div>
                  <p className="text-3xl font-extrabold text-slate-800">{agendados}</p>
                  <p className="text-xs text-slate-500 mt-2">Consultas marcadas via Lara (IA)</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Eficiência de Conversão</span>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Taxa</span>
                  </div>
                  <p className="text-3xl font-extrabold text-blue-600">{taxaConversao}%</p>
                  <p className="text-xs text-slate-500 mt-2">Leads convertidos no período</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tratamentos Fechados</span>
                    <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Vendas</span>
                  </div>
                  <p className="text-3xl font-extrabold text-teal-600">{vendidos}</p>
                  <p className="text-xs text-slate-500 mt-2">Pacientes convertidos na clínica</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Saúde de Resposta SLA</span>
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Alerta</span>
                  </div>
                  <p className="text-3xl font-extrabold text-red-600">{totalEstagnados}</p>
                  <p className="text-xs text-slate-500 mt-2">Leads parados há +24h</p>
                </div>
              </div>

              {/* ROW 2: BENTO GRID CHARTS (GRÁFICO REAL 100% DETERMINÍSTICO) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* AREA CHART REAL E DINÂMICO */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-7 shadow-sm flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Evolução de Atendimentos & Agendamentos</h3>
                      <p className="text-sm text-slate-500 mt-1">Dados reais computados diretamente do Supabase</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-blue-600"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Novos Leads</span>
                      <span className="flex items-center gap-1.5 text-emerald-600"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Agendados</span>
                    </div>
                  </div>

                  {/* SVG REAL DETERMINÍSTICO */}
                  <div className="relative h-64 w-full flex items-end pt-4">
                    <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                      <defs>
                        <linearGradient id="blueGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#059669" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Linhas de Grade */}
                      <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#E2E8F0" strokeDasharray="3 3" />
                      <line x1={paddingX} y1={paddingY + plotHeight / 2} x2={svgWidth - paddingX} y2={paddingY + plotHeight / 2} stroke="#E2E8F0" strokeDasharray="3 3" />
                      <line x1={paddingX} y1={paddingY + plotHeight} x2={svgWidth - paddingX} y2={paddingY + plotHeight} stroke="#CBD5E1" />

                      {/* Área Preenchida - Novos Leads */}
                      <path d={generateAreaPath(pointsTotal)} fill="url(#blueGlow)" />
                      <path d={generateLinePath(pointsTotal)} fill="none" stroke="#2563EB" strokeWidth="3" />

                      {/* Área Preenchida - Agendados */}
                      <path d={generateAreaPath(pointsAgendados)} fill="url(#emeraldGlow)" />
                      <path d={generateLinePath(pointsAgendados)} fill="none" stroke="#059669" strokeWidth="3" />

                      {/* Nos e Valores Reais */}
                      {pointsTotal.map((pt, i) => (
                        <g key={`total-pt-${i}`}>
                          <circle cx={pt.x} cy={pt.y} r="5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
                          {pt.val > 0 && (
                            <text x={pt.x} y={pt.y - 10} textAnchor="middle" className="text-[10px] font-bold fill-blue-600">
                              {pt.val}
                            </text>
                          )}
                        </g>
                      ))}

                      {pointsAgendados.map((pt, i) => (
                        <g key={`agend-pt-${i}`}>
                          <circle cx={pt.x} cy={pt.y} r="5" fill="#059669" stroke="#FFFFFF" strokeWidth="2" />
                          {pt.val > 0 && (
                            <text x={pt.x} y={pt.y + 18} textAnchor="middle" className="text-[10px] font-bold fill-emerald-700">
                              {pt.val}
                            </text>
                          )}
                        </g>
                      ))}
                    </svg>
                  </div>
                  
                  {/* Rótulos dinâmicos do eixo X */}
                  <div className="flex justify-between text-xs font-semibold text-slate-500 mt-4 border-t border-slate-100 pt-3 px-2">
                    {chartBuckets.map((b) => (
                      <span key={b.label}>{b.label}</span>
                    ))}
                  </div>
                </div>

                {/* DONUT CHART DE PROCEDIMENTOS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Procedimentos Solicitados</h3>
                    <p className="text-sm text-slate-500 mt-1">Interesse primário dos pacientes</p>
                  </div>

                  <div className="my-6 flex justify-center items-center">
                    <div className="relative w-44 h-44 flex items-center justify-center rounded-full" style={{
                      background: `conic-gradient(#2563EB 0% 35%, #059669 35% 60%, #F59E0B 60% 80%, #6366F1 80% 100%)`
                    }}>
                      <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                        <span className="text-2xl font-black text-slate-800">{totalLeads}</span>
                        <span className="text-xs font-semibold text-slate-400 uppercase">Consultas</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs font-semibold">
                    {Object.entries(procsCount).slice(0, 4).map(([nome, qtd], idx) => {
                      const cores = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-indigo-500'];
                      const pct = totalLeads ? ((qtd / totalLeads) * 100).toFixed(0) : 0;
                      return (
                        <div key={nome} className="flex justify-between items-center">
                          <span className="flex items-center gap-2 text-slate-700 truncate max-w-[180px]">
                            <span className={`w-2.5 h-2.5 rounded-full ${cores[idx % cores.length]}`}></span>
                            {nome}
                          </span>
                          <span className="text-slate-500 font-mono">{qtd} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* ROW 3: DESEMPENHO POR UNIDADE & FUNIL COMERCIAL */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* DESEMPENHO POR UNIDADE */}
                <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Performance por Unidade Clínica</h3>
                  <p className="text-sm text-slate-500 mb-6">Volume total de pacientes por filial</p>

                  <div className="space-y-5">
                    {LISTA_UNIDADES.map((u) => {
                      const qtdUnidade = leadsNoPeriodo.filter(l => l.unidade === u).length;
                      const pctUnidade = totalLeads ? (qtdUnidade / totalLeads) * 100 : 0;
                      return (
                        <div key={u} className="space-y-1.5">
                          <div className="flex justify-between text-sm font-bold text-slate-700">
                            <span>{u}</span>
                            <span className="text-blue-600">{qtdUnidade} pacientes ({pctUnidade.toFixed(1)}%)</span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${Math.max(pctUnidade, 3)}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FUNIL DE CONVERSÃO DETALHADO */}
                <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Funil Comercial Odontológico</h3>
                  <p className="text-sm text-slate-500 mb-6">Jornada de conversão dos pacientes</p>

                  <div className="space-y-4">
                    {[
                      { etapa: '1. Novos Leads Captados', valor: totalLeads, pct: 100, cor: 'bg-slate-800' },
                      { etapa: '2. Agendados pela Lara (IA)', valor: agendados, pct: totalLeads ? (agendados/totalLeads)*100 : 0, cor: 'bg-blue-600' },
                      { etapa: '3. Consultas Confirmadas', valor: confirmados, pct: totalLeads ? (confirmados/totalLeads)*100 : 0, cor: 'bg-emerald-600' },
                      { etapa: '4. Estiveram na Clínica', valor: naClinica, pct: totalLeads ? (naClinica/totalLeads)*100 : 0, cor: 'bg-amber-500' },
                      { etapa: '5. Tratamentos Fechados', valor: vendidos, pct: totalLeads ? (vendidos/totalLeads)*100 : 0, cor: 'bg-teal-500' },
                    ].map((step) => (
                      <div key={step.etapa} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>{step.etapa}</span>
                          <span>{step.valor} ({step.pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${step.cor} rounded-full transition-all duration-500`} style={{ width: `${Math.max(step.pct, 2)}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* GAVETA LATERAL DO CLIENTE */}
        {leadDrawer && (
          <>
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" onClick={() => setLeadDrawer(null)} />
            <div className="w-[450px] bg-white shadow-2xl flex flex-col z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-xl">Ficha do Paciente</h3>
                  <p className="text-sm text-slate-500 mt-1">Gestão de Informações</p>
                </div>
                <button onClick={() => setLeadDrawer(null)} className="text-slate-400 hover:text-slate-700 text-2xl font-light">✕</button>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-2">Nome Completo</label>
                  <input type="text" value={leadDrawer.name || ''} onChange={(e) => setLeadDrawer({...leadDrawer, name: e.target.value})} onBlur={(e) => handleUpdateLead('name', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-2">WhatsApp</label>
                  <input type="text" readOnly value={leadDrawer.phone || leadDrawer.phone_number || ''} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-base text-slate-500 outline-none cursor-not-allowed" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Unidade</label>
                    <select value={leadDrawer.unidade || 'Pendente'} onChange={(e) => handleUpdateLead('unidade', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm appearance-none cursor-pointer">
                      {['Pendente', 'Santo André', 'Diadema', 'Mauá', 'São Mateus'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Procedimento</label>
                    <select value={procedimentoAtual} onChange={(e) => handleUpdateLead('procedimento', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm appearance-none cursor-pointer">
                      {opcoesProcedimento.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-2">Anotações Internas</label>
                  <textarea rows={5} value={leadDrawer.notas_internas || ''} onChange={(e) => setLeadDrawer({...leadDrawer, notas_internas: e.target.value})} onBlur={(e) => handleUpdateLead('notas_internas', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none shadow-sm" placeholder="Observações do atendimento clínico..." />
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-white grid grid-cols-2 gap-4">
                <button onClick={() => handleUpdateLead('is_paused', !leadDrawer.is_paused)} className={`py-3 rounded-lg font-bold text-base transition-colors border ${leadDrawer.is_paused ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}>
                  {leadDrawer.is_paused ? '▶ Retomar Robô (IA)' : '⏸️ Pausar IA (Assumir)'}
                </button>
                <button onClick={() => { if (onSelectLead) onSelectLead(leadDrawer); }} className="py-3 bg-blue-600 text-white rounded-lg font-bold text-base hover:bg-blue-700 transition-all shadow-md">
                  Abrir no Chat
                </button>
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