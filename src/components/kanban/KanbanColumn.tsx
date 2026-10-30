// File: src/components/kanban/KanbanColumn.tsx

"use client";

import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  id: string;
  titulo: string;
  dotColor: string;
  leads: any[];
  onSelectLead: (lead: any) => void;
}

export default function KanbanColumn({
  id,
  titulo,
  dotColor,
  leads = [],
  onSelectLead,
}: KanbanColumnProps) {
  const isVendido = id === 'vendido';

  return (
    <Droppable droppableId={id}>
      {(provided, snapshot) => (
        <div
          {...provided.droppableProps}
          ref={provided.innerRef}
          className={`flex-shrink-0 w-[340px] flex flex-col max-h-full rounded-2xl bg-slate-100/80 border border-slate-200/80 p-3.5 transition-colors ${
            snapshot.isDraggingOver ? 'bg-slate-200/90 border-blue-400 shadow-inner' : ''
          }`}
        >
          {/* CABEÇALHO DA COLUNA (CLEAN E SEM DIVERGÊNCIA DE VALORES) */}
          <div className="mb-3 px-1 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-3 h-3 rounded-full ${dotColor} shadow-sm`} />
              <h3 className="font-extrabold text-slate-800 text-sm tracking-tight">{titulo}</h3>
              
              {/* BADGE DE CADEADO AUDITADO NA COLUNA DE VENDA */}
              {isVendido && (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-100/80 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  <svg className="w-2.5 h-2.5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Auditado</span>
                </span>
              )}
            </div>

            {/* CONTADOR DE CARDS */}
            <span className="text-slate-700 text-xs font-black bg-slate-200/80 px-2.5 py-0.5 rounded-full">
              {leads.length}
            </span>
          </div>

          {/* LISTA DE CARDS COM SCROLL */}
          <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar min-h-[160px]">
            {leads.length === 0 ? (
              <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-200/80 rounded-xl">
                <span className="text-xs text-slate-400 font-medium">Nenhum paciente</span>
              </div>
            ) : (
              leads.map((lead, index) => (
                <KanbanCard
                  key={String(lead.id)}
                  lead={lead}
                  index={index}
                  colunaId={id}
                  onSelectLead={onSelectLead}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}