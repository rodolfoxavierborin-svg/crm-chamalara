"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Definição das Colunas - Estilo Enterprise (Cores Sutis e Indicadores)
const COLUNAS = [
  { id: 'novo', titulo: 'Novos Leads', dot: 'bg-blue-500', bgBadge: 'bg-blue-100', textBadge: 'text-blue-800' },
  { id: 'em_atendimento', titulo: 'Qualificação (IA)', dot: 'bg-purple-500', bgBadge: 'bg-purple-100', textBadge: 'text-purple-800' },
  { id: 'agendado', titulo: 'Agendados', dot: 'bg-indigo-500', bgBadge: 'bg-indigo-100', textBadge: 'text-indigo-800' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-500', bgBadge: 'bg-emerald-100', textBadge: 'text-emerald-800' },
  { id: 'compareceu', titulo: 'Na Clínica', dot: 'bg-amber-500', bgBadge: 'bg-amber-100', textBadge: 'text-amber-800' },
  { id: 'fechado', titulo: 'Vendidos', dot: 'bg-teal-500', bgBadge: 'bg-teal-100', textBadge: 'text-teal-800' },
  { id: 'faltou', titulo: 'No-Show', dot: 'bg-rose-500', bgBadge: 'bg-rose-100', textBadge: 'text-rose-800' },
];

export default function KanbanBoard({ onSelectLead }: { onSelectLead?: (lead: any) => void }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);

  useEffect(() => {
    setIsBrowser(true);
    fetchLeads();

    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, status: newStatus } : l))
    );

    const { error } = await supabase
      .from('dentup_leads')
      .update({ status: newStatus })
      .eq('id', draggableId);

    if (error) {
      console.error('Erro ao arrastar:', error);
      fetchLeads();
    }
  };

  const handleUpdateLead = async (campo: string, valor: any) => {
    if (!leadDrawer) return;
    setLeadDrawer({ ...leadDrawer, [campo]: valor });
    setLeads((prev) => prev.map((l) => (l.id === leadDrawer.id ? { ...l, [campo]: valor } : l)));
    await supabase.from('dentup_leads').update({ [campo]: valor }).eq('id', leadDrawer.id);
  };

  const totalLeads = leads.length;
  const agendados = leads.filter(l => ['agendado', 'confirmado', 'compareceu', 'fechado'].includes(l.status)).length;
  const taxaConversao = totalLeads > 0 ? ((agendados / totalLeads) * 100).toFixed(1) : '0.0';

  if (!isBrowser) return null;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      
      {/* DASHBOARD DE MÉTRICAS (Enterprise Header) */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex gap-12 shadow-sm z-10 shrink-0">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total de Leads</span>
          <span className="text-3xl font-extrabold text-slate-800 tracking-tight">{totalLeads}</span>
        </div>
        <div className="flex flex-col gap-1 border-l border-slate-200 pl-12">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Agendamentos</span>
          <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">{agendados}</span>
        </div>
        <div className="flex flex-col gap-1 border-l border-slate-200 pl-12">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Conversão da IA</span>
          <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">{taxaConversao}%</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ÁREA DO KANBAN */}
        <div className="flex-1 overflow-x-auto p-8">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-6 h-full items-start">
              {COLUNAS.map((coluna) => {
                const leadsDaColuna = leads.filter((l) => (l.status || 'novo') === coluna.id);

                return (
                  <Droppable droppableId={coluna.id} key={coluna.id}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`flex-shrink-0 w-[320px] flex flex-col max-h-full transition-all duration-200 ${
                          snapshot.isDraggingOver ? 'bg-indigo-50/50 rounded-2xl' : ''
                        }`}
                      >
                        {/* Cabecalho Minimalista da Coluna */}
                        <div className="mb-4 flex justify-between items-center px-1">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full ${coluna.dot} shadow-sm`}></div>
                            <h3 className="font-semibold text-slate-700 text-sm tracking-wide">{coluna.titulo}</h3>
                          </div>
                          <span className="bg-slate-200/70 text-slate-600 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                            {leadsDaColuna.length}
                          </span>
                        </div>

                        {/* Fundo da Coluna e Cards */}
                        <div className="flex-1 overflow-y-auto p-2 -mx-2 space-y-3 min-h-[200px] rounded-xl bg-slate-100/50 border border-slate-200/50">
                          {leadsDaColuna.map((lead, index) => (
                            <Draggable key={lead.id} draggableId={lead.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => setLeadDrawer(lead)}
                                  className={`bg-white p-4 rounded-xl border transition-all duration-200 cursor-grab group ${
                                    snapshot.isDragging 
                                      ? 'shadow-2xl scale-105 rotate-2 border-indigo-400 z-50' 
                                      : 'shadow-sm border-slate-200 hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5'
                                  }`}
                                  style={{ ...provided.draggableProps.style }}
                                >
                                  {/* Nome e Status */}
                                  <div className="flex justify-between items-start mb-1.5">
                                    <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-700 transition-colors line-clamp-1">
                                      {lead.name || 'Novo Paciente'}
                                    </h4>
                                    {lead.is_paused && (
                                      <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold shrink-0 ml-2">
                                        Pausado
                                      </span>
                                    )}
                                  </div>

                                  {/* Telefone */}
                                  <p className="text-[13px] text-slate-500 font-medium mb-3">
                                    {lead.phone || lead.phone_number || 'Sem número'}
                                  </p>

                                  {/* Data de Agendamento (se houver) */}
                                  {lead.data_agendamento && (
                                    <div className="mb-3 inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-semibold">
                                      <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                      {new Date(lead.data_agendamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                    </div>
                                  )}

                                  {/* Rodapé do Card */}
                                  <div className="flex justify-between items-center pt-3 mt-1 border-t border-slate-100">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                      lead.procedimento && lead.procedimento !== 'Não Informado' 
                                        ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {lead.procedimento || 'Sem Interesse'}
                                    </span>
                                    
                                    {/* Avatar/Ícone Genérico da IA ou Humano */}
                                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                      {lead.responsavel === 'Lara (IA)' ? '🤖' : '👤'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
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

        {/* PRONTUÁRIO LATERAL (DRAWER) - Design Limpo */}
        {leadDrawer && (
          <div className="w-[380px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-20 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
            
            {/* Header Drawer */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Ficha do Paciente</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Gestão de Lead</p>
              </div>
              <button 
                onClick={() => setLeadDrawer(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Corpo Form */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5 bg-slate-50/50">
              
              {/* Grupo Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nome Completo</label>
                <input 
                  type="text" 
                  value={leadDrawer.name || ''} 
                  onChange={(e) => setLeadDrawer({...leadDrawer, name: e.target.value})}
                  onBlur={(e) => handleUpdateLead('name', e.target.value)}
                  className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-sm"
                  placeholder="Nome do paciente"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">WhatsApp</label>
                <input 
                  type="text" 
                  readOnly
                  value={leadDrawer.phone || leadDrawer.phone_number || ''} 
                  className="w-full mt-1.5 bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Procedimento</label>
                <select 
                  value={leadDrawer.procedimento || 'Não Informado'}
                  onChange={(e) => handleUpdateLead('procedimento', e.target.value)}
                  className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-sm cursor-pointer"
                >
                  <option value="Não Informado">Não Informado</option>
                  <option value="Implante">Implante</option>
                  <option value="Prótese">Prótese</option>
                  <option value="Aparelho">Aparelho</option>
                  <option value="Limpeza / Clínico">Limpeza / Clínico</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Notas Internas</label>
                <textarea 
                  rows={5}
                  placeholder="Observações restritas da clínica..."
                  value={leadDrawer.notas_internas || ''}
                  onChange={(e) => setLeadDrawer({...leadDrawer, notas_internas: e.target.value})}
                  onBlur={(e) => handleUpdateLead('notas_internas', e.target.value)}
                  className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-sm resize-none"
                />
              </div>
            </div>

            {/* Footer Ações */}
            <div className="p-6 border-t border-slate-100 bg-white flex flex-col gap-3">
              <button
                onClick={() => handleUpdateLead('is_paused', !leadDrawer.is_paused)}
                className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${
                  leadDrawer.is_paused 
                    ? 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {leadDrawer.is_paused ? '▶ Retomar Automação (IA)' : '⏸️ Pausar IA (Assumir)'}
              </button>
              
              <button 
                onClick={() => {
                  if (onSelectLead) onSelectLead(leadDrawer);
                }}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 hover:shadow-md transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                Abrir no Chat
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}