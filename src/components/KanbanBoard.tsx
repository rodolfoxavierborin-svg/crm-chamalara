"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface KanbanBoardProps {
  onSelectLead?: (lead: any) => void;
  userProfile?: any;
}

export default function KanbanBoard({ onSelectLead, userProfile }: KanbanBoardProps) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = userProfile?.cargo?.toLowerCase() === 'admin' || userProfile?.cargo?.toLowerCase() === 'administrador';
  const userUnidade = userProfile?.unidade || 'Todas';

  const [selectedUnidade, setSelectedUnidade] = useState('Todas');

  // AJUSTA O FILTRO INICIAL COM BASE NO CARGO E UNIDADE DO USUÁRIO
  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas') {
      setSelectedUnidade(userUnidade);
    }
  }, [userProfile, isAdmin, userUnidade]);

  useEffect(() => {
    const fetchLeads = async () => {
      const { data, error } = await supabase.from('dentup_leads').select('*');
      if (!error) setLeads(data || []);
      setLoading(false);
    };
    fetchLeads();

    const channel = supabase
      .channel('kanban-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, (payload: any) => {
        const newLead = payload.new as any;
        if (!newLead || !newLead.id) return;
        setLeads((curr) => curr.find((l) => l.id === newLead.id) ? curr.map((l) => (l.id === newLead.id ? newLead : l)) : [...curr, newLead]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // FILTRAGEM DOS LEADS POR BUSCA E UNIDADE
  const filteredLeads = leads.filter((lead) => {
    const nameMatch = (lead.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (lead.phone || lead.phone_number || '').includes(searchTerm);

    const leadUnidade = lead.unidade || lead.unit || 'Sem Unidade';

    // Se o usuário é atendente de unidade específica, ele é forçado a ver apenas a unidade dele
    const targetUnidade = !isAdmin && userUnidade !== 'Todas' ? userUnidade : selectedUnidade;

    const unidadeMatch = targetUnidade === 'Todas' || leadUnidade.toLowerCase() === targetUnidade.toLowerCase();

    return nameMatch && unidadeMatch;
  });

  const columns = [
    { title: 'Novos Pacientes', color: 'bg-blue-500', statusKeys: ['novo', 'sem_agendamento', 'aguardando_contato'] },
    { title: 'Agendados (IA)', color: 'bg-purple-500', statusKeys: ['agendado', 'agendado_ia'] },
    { title: 'Confirmados', color: 'bg-emerald-500', statusKeys: ['confirmado'] },
    { title: 'Na Clínica', color: 'bg-amber-500', statusKeys: ['na_clinica', 'em_atendimento'] },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100/70 p-4 space-y-4 overflow-hidden">
      
      {/* BARRA SUPERIOR DE MÉTRICAS E FILTROS */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4 shrink-0">
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
            <span className="px-3 py-1.5 bg-white text-blue-700 shadow-sm rounded-md">📋 Quadro CRM</span>
          </div>

          {/* FILTRO DE UNIDADE - DESABILITADO PARA ATENDENTES */}
          <select
            disabled={!isAdmin && userUnidade !== 'Todas'}
            value={!isAdmin && userUnidade !== 'Todas' ? userUnidade : selectedUnidade}
            onChange={(e) => setSelectedUnidade(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="Todas">Todas as Unidades</option>
            <option value="Diadema">Diadema</option>
            <option value="Mauá">Mauá</option>
            <option value="Santo André">Santo André</option>
            <option value="São Mateus">São Mateus</option>
          </select>

          <input
            type="text"
            placeholder="🔍 Buscar paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-48 bg-white"
          />
        </div>

        {/* METRICAS */}
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-slate-400 block font-bold text-[10px] uppercase">Pacientes Totais</span>
            <span className="text-base font-extrabold text-slate-800">{filteredLeads.length}</span>
          </div>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <span className="text-slate-400 block font-bold text-[10px] uppercase">Agendados (IA)</span>
            <span className="text-base font-extrabold text-blue-600">
              {filteredLeads.filter(l => (l.status || '').includes('agendado')).length}
            </span>
          </div>
        </div>

      </div>

      {/* COLUNAS KANBAN */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto min-h-0">
        {columns.map((col) => {
          const colLeads = filteredLeads.filter((lead) => {
            const st = (lead.status || 'novo').toLowerCase();
            if (col.statusKeys.includes('novo') && (!lead.status || st === 'novo' || st === 'sem_agendamento')) return true;
            return col.statusKeys.some(k => st.includes(k));
          });

          return (
            <div key={col.title} className="bg-slate-200/50 border border-slate-200/80 rounded-xl p-3 flex flex-col h-full overflow-hidden">
              <div className="flex justify-between items-center mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.color}`}></div>
                  <h3 className="font-bold text-xs text-slate-700">{col.title}</h3>
                </div>
                <span className="text-[11px] bg-slate-300/70 text-slate-700 font-bold px-2 py-0.5 rounded-full">{colLeads.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {colLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => onSelectLead && onSelectLead(lead)}
                    className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2"
                  >
                    <p className="font-bold text-xs text-slate-800 truncate">{lead.name || 'Sem Nome'}</p>
                    <p className="text-[11px] text-slate-500">{lead.phone || lead.phone_number}</p>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">
                        {lead.unidade || lead.unit || 'Sem Unidade'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Agora</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}