// File: src/components/KanbanBoard.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext } from '@hello-pangea/dnd';
import {
  COLUNAS,
  LISTA_UNIDADES,
  getIsoDateBounds,
  getHorasParado,
  getTempoCronologicoKanban,
  formatarMoeda,
  isLeadWithinPeriod,
  fetchAllLeadsFromSupabase
} from '../utils/kanbanUtils';
import MetricsBanner from './kanban/MetricsBanner';
import KanbanFilters from './kanban/KanbanFilters';
import KanbanColumn from './kanban/KanbanColumn';
import KanbanCalendar from './kanban/KanbanCalendar';
import KanbanAnalytics from './kanban/KanbanAnalytics';
import LeadDrawer from './kanban/LeadDrawer';
import CreatePatientModal from './kanban/CreatePatientModal';

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
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'kanban' | 'analytics' | 'calendar'>('kanban');
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [dbMetrics, setDbMetrics] = useState({ total_leads: 0, agendados: 0, confirmados: 0, compareceram: 0, vendidos: 0, faturamento_total: 0 });

  // 🛡️ CONTROLE DE PERMISSÕES POR CARGO (EXATO PELAS OPÇÕES DO SISTEMA)
  const cargoNormalized = userProfile?.cargo?.toLowerCase().trim() || '';
  const isAdmin = cargoNormalized.includes('admin');
  
  // Autoriza APENAS "Administrador Geral" e "Gerente de Unidade"
  const isManagerOrAdmin = cargoNormalized.includes('admin') || 
                           cargoNormalized.includes('gerente') || 
                           cargoNormalized.includes('gestor');

  const userUnidade = userProfile?.unidade || 'all';
  const targetUnidade = (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') ? userUnidade : unidadeFilter;

  const fetchDbMetrics = useCallback(async () => {
    const bounds = getIsoDateBounds(dateRange, customStart, customEnd);
    const { data, error } = await supabase.rpc('get_kanban_metrics', {
      p_unidade: targetUnidade,
      p_start_date: dateRange === 'all' ? '2000-01-01T00:00:00Z' : bounds.startIso,
      p_end_date: dateRange === 'all' ? '2100-01-01T23:59:59Z' : bounds.endIso
    });
    if (!error && data && data.length > 0) {
      const m = data[0];
      setDbMetrics({
        total_leads: Number(m.total_leads) || 0,
        agendados: Number(m.agendados) || 0,
        confirmados: Number(m.confirmados) || 0,
        compareceram: Number(m.compareceram) || 0,
        vendidos: Number(m.vendidos) || 0,
        faturamento_total: Number(m.faturamento_total) || 0
      });
    }
  }, [dateRange, customStart, customEnd, targetUnidade]);

  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') setUnidadeFilter(userUnidade);
  }, [userProfile, isAdmin, userUnidade]);

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

  // 2. RECARREGA RPC AO ALTERAR FILTROS
  useEffect(() => {
    fetchDbMetrics();
  }, [fetchDbMetrics]);

  // 🛡️ ARRASTO COM BLOQUEIO DE SEGURANÇA NA VENDA
  const handleDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;

    const leadEncontrado = (leads || []).find((l) => String(l.id) === String(draggableId));
    if (!leadEncontrado) return;

    const statusOrigem = (source.droppableId || '').toLowerCase().trim();
    const statusDestino = (destination.droppableId || '').toLowerCase().trim();
    const statusAtualLead = (leadEncontrado.status || '').toLowerCase().trim();

    // TRAVA DE SEGURANÇA: Bloqueia movimentação se o card estiver em 'vendido' e o usuário NÃO for Admin/Gerente
    if ((statusOrigem === 'vendido' || statusAtualLead === 'vendido') && !isManagerOrAdmin) {
      alert('🔒 Ação Bloqueada: Apenas Administradores Gerais e Gerentes de Unidade podem alterar um card de Venda Concluída.');
      return;
    }

    const agoraISO = new Date().toISOString();
    const updates: any = { status: statusDestino, data_movimentacao: agoraISO };

    // PRESERVAÇÃO HISTÓRICA NO FUSO DE SÃO PAULO: Grava a data_venda apenas na primeira conversão
    if (statusDestino === 'vendido') {
      if (!leadEncontrado.data_venda) {
        const spToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        updates.data_venda = `${spToday}T12:00:00-03:00`;
      }
    }

    // Atualização Otimista no Estado Local
    setLeads((prev = []) => prev.map((l) => (String(l.id) === String(draggableId) ? { ...l, ...updates } : l)));
    if (leadDrawer && String(leadDrawer.id) === String(draggableId)) {
      setLeadDrawer((prev: any) => (prev ? { ...prev, ...updates } : null));
    }

    // Persistência no Supabase e Atualização das Métricas
    await supabase.from('dentup_leads').update(updates).eq('id', draggableId);
    fetchDbMetrics();
  };

  const handleUpdateLead = async (campo: string, valor: any) => {
    if (!leadDrawer) return;
    setLeadDrawer((prev: any) => (prev ? { ...prev, [campo]: valor } : null));
    setLeads((prev = []) => prev.map((l) => (String(l.id) === String(leadDrawer.id) ? { ...l, [campo]: valor } : l)));
    await supabase.from('dentup_leads').update({ [campo]: valor }).eq('id', leadDrawer.id);
    fetchDbMetrics();
  };

  const handlePatientCreated = (newPatient: any) => {
    if (newPatient) {
      setLeads((prev = []) => prev.some((l) => String(l.id) === String(newPatient.id)) ? prev.map((l) => (String(l.id) === String(newPatient.id) ? { ...l, ...newPatient } : l)) : [newPatient, ...prev]);
    }
    fetchLeads();
    fetchDbMetrics();
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

  // Sincroniza métricas de vendas fechadas e faturamento estritamente pela data_venda no período
  const effectiveMetrics = useMemo(() => {
    const vendidosPeriodo = leadsVisiveisKanban.filter(
      (l) => (l.status || '').toLowerCase().trim() === 'vendido'
    );
    const faturamentoPeriodo = vendidosPeriodo.reduce(
      (acc, l) => acc + (Number(l.valor_venda) || 0),
      0
    );

    return {
      ...dbMetrics,
      vendidos: vendidosPeriodo.length,
      faturamento_total: faturamentoPeriodo,
    };
  }, [dbMetrics, leadsVisiveisKanban]);

  // BUSCA HIGIENIZADA DE TEXTO E TELEFONES
  const leadsFiltrados = useMemo(() => {
    const termoNorm = normalizarTexto(searchTerm);
    if (!termoNorm) return leadsVisiveisKanban;

    const termoNumerico = searchTerm.replace(/\D/g, '');

    return leadsVisiveisKanban.filter((lead) => {
      const nomeNorm = normalizarTexto(lead.name || lead.nome || '');
      const telNumerico = (lead.phone || lead.phone_number || '').replace(/\D/g, '');

      const bateuNome = nomeNorm.includes(termoNorm);
      const bateuTelefone = termoNumerico.length > 0 && (
        telNumerico.includes(termoNumerico) || 
        (termoNumerico.length >= 8 && telNumerico.endsWith(termoNumerico))
      );

      return bateuNome || bateuTelefone;
    });
  }, [leadsVisiveisKanban, searchTerm]);

  const totalEstagnados = useMemo(() => leadsNaUnidadeGlobal.filter(l => getHorasParado(l) >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(l.status)).length, [leadsNaUnidadeGlobal]);

  if (!isBrowser) return null;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-800 font-sans">
      <div className="bg-white border-b border-slate-200/80 z-10 sticky top-0 shadow-sm">
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
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {activeTab === 'kanban' && (
          <div className="flex-1 overflow-x-auto p-6 custom-scrollbar">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-6 h-full items-start">
                {COLUNAS.map((coluna) => (
                  <KanbanColumn
                    key={coluna.id} id={coluna.id} titulo={coluna.titulo} dotColor={coluna.dot}
                    leads={leadsFiltrados.filter((l) => {
                      const st = (l.status || 'novo').toLowerCase().trim();
                      const colId = coluna.id.toLowerCase().trim();
                      if (colId === 'encerrado' || colId === 'encerrados') return st === 'encerrado' || st === 'encerrados';
                      return st === colId;
                    }).sort((a, b) => getTempoCronologicoKanban(b) - getTempoCronologicoKanban(a))}
                    onSelectLead={(lead) => setLeadDrawer(lead)}
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
        <LeadDrawer key={leadDrawer?.id} lead={leadDrawer} onClose={() => setLeadDrawer(null)} onUpdateLead={handleUpdateLead} onSelectLead={onSelectLead} />
        <CreatePatientModal isOpen={isNewPatientModalOpen} onClose={() => setIsNewPatientModalOpen(false)} onPatientCreated={handlePatientCreated} isAdmin={isAdmin} userUnidade={userUnidade} />
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }`}} />
    </div>
  );
}
