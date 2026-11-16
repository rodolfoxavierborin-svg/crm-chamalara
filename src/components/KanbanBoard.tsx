// File: src/components/KanbanBoard.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext } from '@hello-pangea/dnd';
import {
  COLUNAS,
  LISTA_UNIDADES,
  getHorasParado,
  getTempoCronologicoKanban,
  formatarMoeda,
  parseValorMonetario,
  isLeadWithinPeriod,
  fetchAllLeadsFromSupabase,
  isLeadAgendadoPelaLara,
  obterVoucherDoLead,
  updateLeadResiliente
} from '../utils/kanbanUtils';
import MetricsBanner from './kanban/MetricsBanner';
import KanbanFilters from './kanban/KanbanFilters';
import KanbanColumn from './kanban/KanbanColumn';
import KanbanCalendar from './kanban/KanbanCalendar';
import KanbanAnalytics from './kanban/KanbanAnalytics';
import LeadDrawer from './kanban/LeadDrawer';
import CreatePatientModal from './kanban/CreatePatientModal';
import CloseSaleModal from './kanban/CloseSaleModal';

// Normalizador Unicode para busca resiliente (fontes de WhatsApp e acentos)
const normalizarTexto = (texto: string) => {
  return (texto || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export default function KanbanBoard({ onSelectLead, userProfile }: { onSelectLead?: (lead: any) => void; userProfile?: any }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);
  const [leadParaFecharVenda, setLeadParaFecharVenda] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'kanban' | 'analytics' | 'calendar'>('kanban');
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [activeMobileCol, setActiveMobileCol] = useState<string>(COLUNAS[0]?.id || 'novo');
  const kanbanScrollRef = useRef<HTMLDivElement>(null);

  // 🛡️ CONTROLE DE PERMISSÕES POR CARGO (EXATO PELAS OPÇÕES DO SISTEMA)
  const cargoNormalized = userProfile?.cargo?.toLowerCase().trim() || '';
  const isAdmin = cargoNormalized.includes('admin');
  
  // Autoriza APENAS "Administrador Geral" e "Gerente de Unidade"
  const isManagerOrAdmin = cargoNormalized.includes('admin') || 
                           cargoNormalized.includes('gerente') || 
                           cargoNormalized.includes('gestor');

  const userUnidade = userProfile?.unidade || 'all';
  const targetUnidade = (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') ? userUnidade : unidadeFilter;

  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') setUnidadeFilter(userUnidade);
  }, [userProfile, isAdmin, userUnidade]);

  // Carregar lista de colaboradores (dentup_profiles) para atribuição de vendas na clínica
  useEffect(() => {
    let isMounted = true;
    const fetchProfiles = async () => {
      const { data, error } = await supabase
        .from('dentup_profiles')
        .select('id, nome, email, cargo, unidade')
        .order('nome', { ascending: true });
      if (!error && data && isMounted) {
        setProfiles(data);
      }
    };
    fetchProfiles();
    return () => { isMounted = false; };
  }, []);

  // Busca paginada em lotes para não descartar leads antigos com mais de 1000 registros no banco
  const fetchLeads = useCallback(async () => {
    const allData = await fetchAllLeadsFromSupabase(supabase);
    setLeads(allData);
  }, []);

  // 1. WEBSOCKET REALTIME ISOLADO
  useEffect(() => {
    setIsBrowser(true);
    fetchLeads();

    const channel = supabase.channel(`kanban-realtime-${Math.random().toString(36).substring(2, 9)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, (payload: any) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          setLeads((prev = []) => prev.some((l) => String(l.id) === String(payload.new.id)) ? prev.map((l) => (String(l.id) === String(payload.new.id) ? { ...l, ...payload.new } : l)) : [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setLeads((prev = []) => prev.map((l) => (String(l.id) === String(payload.new.id) ? { ...l, ...payload.new } : l)));
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setLeads((prev = []) => prev.filter((l) => String(l.id) !== String(payload.old.id)));
        } else fetchLeads();
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLeads]);

  // 🛡️ MOVIMENTAÇÃO UNIFICADA DE ETAPA (DRAG-AND-DROP + SELETOR MOBILE/DRAWER) COM TODAS AS TRAVAS DE SEGURANÇA
  const moverLeadParaEtapa = async (
    leadId: string | number,
    statusOrigemRaw: string,
    statusDestinoRaw: string
  ) => {
    const leadEncontrado = (leads || []).find((l) => String(l.id) === String(leadId));
    if (!leadEncontrado) return;

    const statusOrigem = (statusOrigemRaw || '').toLowerCase().trim();
    const statusDestino = (statusDestinoRaw || '').toLowerCase().trim();
    const statusAtualLead = (leadEncontrado.status || '').toLowerCase().trim();

    if (!statusDestino || statusDestino === statusOrigem) return;

    // TRAVA 1: SEGURANÇA NA VENDA (Apenas Admin/Gerente pode tirar de 'vendido')
    if ((statusOrigem === 'vendido' || statusAtualLead === 'vendido') && !isManagerOrAdmin) {
      alert('🔒 Ação Bloqueada: Apenas Administradores Gerais e Gerentes de Unidade podem alterar um card de Venda Concluída.');
      return;
    }

    // TRAVA 2: POSSE DO OPERADOR NO CHAT (Evita roubo de atendimento ativo no WhatsApp entre atendentes)
    const leadRespId = leadEncontrado.responsavel_id;
    const currentUserId = userProfile?.id;
    const hasActiveChatOwner = Boolean(leadEncontrado.is_paused) && leadRespId && String(leadRespId).trim() !== '' && String(leadRespId) !== 'null';
    if (hasActiveChatOwner && currentUserId && String(leadRespId) !== String(currentUserId) && !isManagerOrAdmin && statusDestino !== 'vendido') {
      alert(`🔒 Ação Bloqueada: Este paciente está em atendimento no chat por "${leadEncontrado.responsavel_nome || 'outro colaborador'}". Apenas o responsável ou um Gerente/Admin pode movimentá-lo.`);
      return;
    }

    // TRAVA 3: PROTEÇÃO DO VOUCHER VIP REAL DA LARA
    const agendadoPelaLara = isLeadAgendadoPelaLara(leadEncontrado);
    if (statusDestino === 'agendado_clinica' && agendadoPelaLara && leadEncontrado.voucher) {
      alert(`🔒 Blindagem Ativa: Este agendamento possui Voucher VIP confirmado pela IA Lara (${leadEncontrado.voucher}). O mérito do agendamento da Lara é imutável.`);
      return;
    }

    // TRAVA 4: CHECK-OUT COMERCIAL OBRIGATÓRIO AO MOVER PARA "TRATAMENTO FECHADO"
    if (statusDestino === 'vendido') {
      setLeadParaFecharVenda(leadEncontrado);
      return;
    }

    const agoraISO = new Date().toISOString();
    const updates: Record<string, any> = { status: statusDestino, data_movimentacao: agoraISO };

    // ATRIBUIÇÃO E PRESERVAÇÃO DETERMINÍSTICA DE AGENDAMENTO (LARA VS CLÍNICA)
    if (statusDestino === 'agendado_clinica' || (!agendadoPelaLara && statusDestino === 'agendado')) {
      // Se não tem voucher real da Lara, qualquer agendamento pertence à recepção/clínica
      updates.status = 'agendado_clinica';
      updates.tipo_agendamento = 'clinica';
      updates.agendado_por = leadEncontrado.agendado_por && !leadEncontrado.agendado_por.toLowerCase().includes('lara')
        ? leadEncontrado.agendado_por
        : (userProfile?.nome || leadEncontrado.responsavel_nome || 'Recepção');
      if (!leadEncontrado.data_agendamento) {
        updates.data_agendamento = agoraISO;
      }
    } else if (agendadoPelaLara) {
      updates.tipo_agendamento = 'lara';
      updates.agendado_por = 'Lara (IA)';
      const voucher = obterVoucherDoLead(leadEncontrado);
      if (voucher) updates.voucher = voucher;
    }

    // Atualização Otimista no Estado Local
    setLeads((prev = []) => prev.map((l) => (String(l.id) === String(leadId) ? { ...l, ...updates } : l)));
    if (leadDrawer && String(leadDrawer.id) === String(leadId)) {
      setLeadDrawer((prev: any) => (prev ? { ...prev, ...updates } : null));
    }

    // Persistência Resiliente no Supabase
    await updateLeadResiliente(supabase, leadId, updates);
  };

  const handleDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;
    await moverLeadParaEtapa(draggableId, source.droppableId, destination.droppableId);
  };

  // Confirmação do Modal de Fechamento de Venda (Separação estrita entre Agendador e Vendedor)
  const handleConfirmSaleModal = async (dadosVenda: {
    valor_venda: number;
    vendedor_id: string | null;
    vendedor_nome: string;
    procedimento: string;
    data_venda: string;
    voucher?: string | null;
    tipo_agendamento: string;
    agendado_por: string;
  }) => {
    if (!leadParaFecharVenda) return;
    const targetId = leadParaFecharVenda.id;
    const agoraISO = new Date().toISOString();

    const updates: Record<string, any> = {
      status: 'vendido',
      valor_venda: dadosVenda.valor_venda,
      vendedor_id: dadosVenda.vendedor_id,
      vendedor_nome: dadosVenda.vendedor_nome,
      procedimento: dadosVenda.procedimento,
      data_venda: dadosVenda.data_venda,
      data_movimentacao: agoraISO,
      tipo_agendamento: dadosVenda.tipo_agendamento,
      agendado_por: dadosVenda.agendado_por,
    };

    if (dadosVenda.voucher) {
      updates.voucher = dadosVenda.voucher;
    }

    setLeads((prev = []) =>
      prev.map((l) => (String(l.id) === String(targetId) ? { ...l, ...updates } : l))
    );
    if (leadDrawer && String(leadDrawer.id) === String(targetId)) {
      setLeadDrawer((prev: any) => (prev ? { ...prev, ...updates } : null));
    }

    setLeadParaFecharVenda(null);
    await updateLeadResiliente(supabase, targetId, updates);
  };

  const handleUpdateLead = async (campoOuObjeto: string | Record<string, any>, valor?: any) => {
    if (!leadDrawer) return;

    const updates: Record<string, any> = typeof campoOuObjeto === 'string'
      ? { [campoOuObjeto]: valor }
      : { ...campoOuObjeto };

    // Se é agendamento confirmado da Lara com Voucher, preserva a autoria da IA
    if (isLeadAgendadoPelaLara(leadDrawer)) {
      updates.tipo_agendamento = 'lara';
      updates.agendado_por = 'Lara (IA)';
      const voucher = obterVoucherDoLead(leadDrawer);
      if (voucher && !updates.voucher) {
        updates.voucher = voucher;
      }
    } else if (updates.data_agendamento && !leadDrawer.voucher) {
      // Se não tem voucher e a atendente está agendando, mérito é da atendente / clínica
      updates.tipo_agendamento = 'clinica';
      updates.agendado_por = userProfile?.nome || leadDrawer.responsavel_nome || 'Recepção';
      if (leadDrawer.status === 'agendado' || leadDrawer.status === 'novo') {
        updates.status = 'agendado_clinica';
      }
    }

    setLeadDrawer((prev: any) => (prev ? { ...prev, ...updates } : null));
    setLeads((prev = []) => prev.map((l) => (String(l.id) === String(leadDrawer.id) ? { ...l, ...updates } : l)));
    await updateLeadResiliente(supabase, leadDrawer.id, updates);
  };

  const handlePatientCreated = (newPatient: any) => {
    if (newPatient) {
      setLeads((prev = []) => prev.some((l) => String(l.id) === String(newPatient.id)) ? prev.map((l) => (String(l.id) === String(newPatient.id) ? { ...l, ...newPatient } : l)) : [newPatient, ...prev]);
    }
    fetchLeads();
  };

  // FILTRO DE UNIDADES RESILIENTE ("Todas as Unidades", "all", "Todas")
  const leadsNaUnidadeGlobal = useMemo(() => {
    const targetLower = (targetUnidade || '').toLowerCase().trim();
    const isTodas = !targetUnidade || targetLower === 'all' || targetLower.includes('toda');

    if (isTodas) return leads || [];

    return (leads || []).filter((lead) => {
      const leadUnit = (lead.unidade || lead.unit || 'Pendente').toLowerCase().trim();
      return leadUnit === targetLower;
    });
  }, [leads, targetUnidade]);

  // FILTRO TEMPORAL (Coluna 'vendido' filtrada estritamente por data_venda no fuso SP)
  const leadsVisiveisKanban = useMemo(() => {
    if (dateRange === 'all') return leadsNaUnidadeGlobal;
    return leadsNaUnidadeGlobal.filter((lead) =>
      isLeadWithinPeriod(lead, dateRange, customStart, customEnd)
    );
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  // Sincronização determinística e instantânea de TODAS as métricas do Kanban
  const effectiveMetrics = useMemo(() => {
    const leads = leadsVisiveisKanban || [];

    const agendadosCards = leads.filter((l) => {
      const st = (l.status || '').toLowerCase().trim();
      return st === 'agendado' || st === 'agendado_clinica';
    });

    const confirmadosCards = leads.filter(
      (l) => (l.status || '').toLowerCase().trim() === 'confirmado'
    );

    const compareceramCards = leads.filter(
      (l) => (l.status || '').toLowerCase().trim() === 'na_clinica'
    );

    const vendidosCards = leads.filter(
      (l) => (l.status || '').toLowerCase().trim() === 'vendido'
    );

    const faturamentoPeriodo = vendidosCards.reduce(
      (acc, l) => acc + parseValorMonetario(l.valor_venda),
      0
    );

    return {
      total_leads: leads.length,
      agendados: agendadosCards.length,
      confirmados: confirmadosCards.length,
      compareceram: compareceramCards.length,
      vendidos: vendidosCards.length,
      faturamento_total: faturamentoPeriodo,
    };
  }, [leadsVisiveisKanban]);

  // BUSCA HIGIENIZADA DE TEXTO, TELEFONES E VOUCHERS
  const leadsFiltrados = useMemo(() => {
    const termoNorm = normalizarTexto(searchTerm);
    if (!termoNorm) return leadsVisiveisKanban;

    const termoNumerico = searchTerm.replace(/\D/g, '');

    return leadsVisiveisKanban.filter((lead) => {
      const nomeNorm = normalizarTexto(lead.name || lead.nome || '');
      const telNumerico = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
      const voucherNorm = normalizarTexto(obterVoucherDoLead(lead) || '');

      const bateuNome = nomeNorm.includes(termoNorm);
      const bateuVoucher = voucherNorm.includes(termoNorm);
      const bateuTelefone = termoNumerico.length > 0 && (
        telNumerico.includes(termoNumerico) || 
        (termoNumerico.length >= 8 && telNumerico.endsWith(termoNumerico))
      );

      return bateuNome || bateuTelefone || bateuVoucher;
    });
  }, [leadsVisiveisKanban, searchTerm]);

  const totalEstagnados = useMemo(() => leadsNaUnidadeGlobal.filter(l => getHorasParado(l) >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(l.status)).length, [leadsNaUnidadeGlobal]);

  const colunasComLeads = useMemo(() => {
    return COLUNAS.map((coluna) => {
      const colId = coluna.id.toLowerCase().trim();
      const colLeads = leadsFiltrados
        .filter((l) => {
          const st = (l.status || 'novo').toLowerCase().trim();
          if (colId === 'encerrado' || colId === 'encerrados') {
            return st === 'encerrado' || st === 'encerrados';
          }
          // DIVISÃO AUDITADA: SE TEM VOUCHER REAL DA LARA -> COLUNA LARA. SE NÃO -> COLUNA CLÍNICA!
          if (colId === 'agendado') {
            return isLeadAgendadoPelaLara(l) && (st === 'agendado' || st === 'agendado_clinica');
          }
          if (colId === 'agendado_clinica') {
            return !isLeadAgendadoPelaLara(l) && (st === 'agendado' || st === 'agendado_clinica');
          }
          return st === colId;
        })
        .sort((a, b) => getTempoCronologicoKanban(b) - getTempoCronologicoKanban(a));

      return { ...coluna, leads: colLeads };
    });
  }, [leadsFiltrados]);

  const scrollToColumn = (colId: string) => {
    setActiveMobileCol(colId);
    const el = kanbanScrollRef.current?.querySelector(`[data-col-id="${colId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  const handleKanbanScroll = () => {
    const container = kanbanScrollRef.current;
    if (!container || typeof window === 'undefined' || window.innerWidth >= 768) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestId = activeMobileCol;
    let minDist = Infinity;
    const children = container.querySelectorAll<HTMLElement>('[data-col-id]');
    children.forEach((child) => {
      const colCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(colCenter - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        const id = child.getAttribute('data-col-id');
        if (id) closestId = id;
      }
    });
    if (closestId !== activeMobileCol) {
      setActiveMobileCol(closestId);
    }
  };

  if (!isBrowser) return null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F8FAFC] text-slate-800 font-sans">
      <div className="bg-white border-b border-slate-200/80 z-10 sticky top-0 shadow-sm shrink-0">
        <KanbanFilters
          activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} userUnidade={userUnidade}
          targetUnidade={targetUnidade} setUnidadeFilter={setUnidadeFilter} dateRange={dateRange} setDateRange={setDateRange}
          customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} onNovoPaciente={() => setIsNewPatientModalOpen(true)} unidades={LISTA_UNIDADES}
        />
        
        <MetricsBanner
          leads={leadsVisiveisKanban}
          dbMetrics={effectiveMetrics}
          selectedUnit={targetUnidade}
          totalEstagnados={totalEstagnados}
          formatarMoeda={formatarMoeda}
        />

        {/* SELETOR RÁPIDO DE ETAPAS NO MOBILE (1 TOQUE PARA IR À COLUNA) */}
        {activeTab === 'kanban' && (
          <div className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar touch-scroll">
            {colunasComLeads.map((col) => {
              const isSelected = activeMobileCol === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => scrollToColumn(col.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 active:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span>{col.titulo}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {col.leads.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {activeTab === 'kanban' && (
          <div
            ref={kanbanScrollRef}
            onScroll={handleKanbanScroll}
            className="flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory md:snap-none px-3 py-3 md:p-6 touch-scroll custom-scrollbar"
          >
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-3 md:gap-6 h-full items-start">
                {colunasComLeads.map((coluna) => (
                  <KanbanColumn
                    key={coluna.id}
                    id={coluna.id}
                    titulo={coluna.titulo}
                    dotColor={coluna.dot}
                    leads={coluna.leads}
                    onSelectLead={(lead) => setLeadDrawer(lead)}
                    userProfile={userProfile}
                  />
                ))}
              </div>
            </DragDropContext>
          </div>
        )}
        {activeTab === 'analytics' && (
          <KanbanAnalytics
            leadsNaUnidadeGlobal={leadsNaUnidadeGlobal}
            dateRange={dateRange}
            customStart={customStart}
            customEnd={customEnd}
            dbMetrics={effectiveMetrics}
          />
        )}
        {activeTab === 'calendar' && <KanbanCalendar targetUnidade={targetUnidade} />}
        <LeadDrawer 
          key={leadDrawer?.id} 
          lead={leadDrawer} 
          profiles={profiles}
          onClose={() => setLeadDrawer(null)} 
          onUpdateLead={handleUpdateLead} 
          onMoveStage={(leadObj, novoStatus) =>
            moverLeadParaEtapa(leadObj.id, leadObj.status || 'novo', novoStatus)
          }
          onSelectLead={onSelectLead} 
          userProfile={userProfile}
        />
        <CreatePatientModal 
          isOpen={isNewPatientModalOpen} 
          onClose={() => setIsNewPatientModalOpen(false)} 
          onPatientCreated={handlePatientCreated} 
          isAdmin={isAdmin} 
          userUnidade={userUnidade} 
          userProfile={userProfile} 
        />
        {leadParaFecharVenda && (
          <CloseSaleModal
            lead={leadParaFecharVenda}
            profiles={profiles}
            userProfile={userProfile}
            onClose={() => setLeadParaFecharVenda(null)}
            onConfirmSale={handleConfirmSaleModal}
          />
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }`}} />
    </div>
  );
}
