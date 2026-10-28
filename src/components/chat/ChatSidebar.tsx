// File: src/components/chat/ChatSidebar.tsx

"use client";

import React from 'react';
import { formatarHorarioWhatsApp, getUltimaInteracao } from '../../utils/dateUtils';

interface ChatSidebarProps {
  sortedLeads: any[];
  selectedLead: any | null;
  onSelectLead: (lead: any) => void;
  isAdmin: boolean;
  userUnidade: string;
}

export default function ChatSidebar({
  sortedLeads,
  selectedLead,
  onSelectLead,
  isAdmin,
  userUnidade,
}: ChatSidebarProps) {
  // REGRA DETERMINÍSTICA DE NEGÓCIO DO CHAT:
  // 1. Filtra apenas os leads com interação real de mensagens (origem WhatsApp)
  // 2. Oculta pacientes do balcão ("+ Novo Paciente") que não possuem histórico de chat
  // 3. Ordena do mais recente para o mais antigo via relógio de ms
  const chatLeads = sortedLeads
    .filter((lead) => {
      const ultimaInteracaoMs = getUltimaInteracao(lead);
      const isManualWithoutChat = lead.origem === 'manual' && !lead.ultima_interacao;
      return ultimaInteracaoMs > 0 && !isManualWithoutChat;
    })
    .sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  return (
    <div
      className={`w-full md:w-[380px] border-r border-slate-200 bg-white flex flex-col ${
        selectedLead ? 'hidden md:flex' : 'flex'
      }`}
    >
      {/* CABEÇALHO DA SIDEBAR */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center h-[52px] md:h-[56px] shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base font-bold text-slate-800 notranslate">
            Mensagens
          </h2>
          {!isAdmin && userUnidade !== 'Todas' && (
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              {userUnidade}
            </span>
          )}
        </div>
        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full">
          {chatLeads.length}
        </span>
      </div>

      {/* LISTA DE LEADS / PACIENTES */}
      <ul className="flex-1 overflow-y-auto bg-white custom-scrollbar">
        {chatLeads.map((lead) => {
          const ultimaInteracao = lead.ultima_interacao || lead.created_at;
          const isSelected = selectedLead?.id === lead.id;
          const photo = lead.avatar_url || lead.photo_url || lead.profile_pic;

          return (
            <li
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={`cursor-pointer p-3 transition-all border-b border-slate-100 flex gap-3 items-center ${
                isSelected ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
              }`}
            >
              {photo ? (
                <img
                  src={photo}
                  alt={lead.name || 'Paciente'}
                  className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-base shrink-0">
                  {lead.name ? lead.name.charAt(0).toUpperCase() : 'P'}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <p
                    className={`font-semibold text-sm truncate ${
                      isSelected ? 'text-slate-900' : 'text-slate-800'
                    }`}
                  >
                    {lead.name || 'Sem Nome'}
                  </p>
                  <span
                    className={`text-[11px] whitespace-nowrap ml-2 font-bold ${
                      formatarHorarioWhatsApp(ultimaInteracao) === 'Ontem'
                        ? 'text-emerald-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {formatarHorarioWhatsApp(ultimaInteracao)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500 truncate">
                    {lead.phone || lead.phone_number}
                  </p>
                  {lead.is_paused && (
                    <span className="bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ml-2 shrink-0 notranslate">
                      Humano
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}