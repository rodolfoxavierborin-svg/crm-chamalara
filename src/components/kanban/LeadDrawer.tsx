// File: src/components/kanban/LeadDrawer.tsx

"use client";

import React from 'react';
import { toDateStrSP } from '../../utils/dateUtils';

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

const OPCOES_FEEDBACK_PADRAO = [
  'Não Informado',
  'FECHOU',
  'MARCOU RETORNO',
  'ACHOU CARO',
  'NÃO QUIZ',
  'SEM INTERESSE',
  'VOU FALAR COM A FAMILIA',
  'SEM DINHEIRO'
];

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

const formatarDataInput = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  return toDateStrSP(isoDate);
};

const dateInputToISO = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  // Ancora no meio-dia do fuso de São Paulo (America/Sao_Paulo, UTC-3)
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00-03:00`;
};

interface LeadDrawerProps {
  lead: any | null;
  onClose: () => void;
  onUpdateLead: (campo: string, valor: any) => void;
  onSelectLead?: (lead: any) => void;
}

export default function LeadDrawer({
  lead,
  onClose,
  onUpdateLead,
  onSelectLead
}: LeadDrawerProps) {
  if (!lead) return null;

  const procedimentoAtual = lead.procedimento || 'Não Informado';
  const opcoesProcedimento = OPCOES_PROCEDIMENTO_PADRAO.includes(procedimentoAtual)
    ? OPCOES_PROCEDIMENTO_PADRAO
    : [procedimentoAtual, ...OPCOES_PROCEDIMENTO_PADRAO];

  const feedbackAtual = lead.feedback || 'Não Informado';
  const opcoesFeedback = OPCOES_FEEDBACK_PADRAO.includes(feedbackAtual)
    ? OPCOES_FEEDBACK_PADRAO
    : [feedbackAtual, ...OPCOES_FEEDBACK_PADRAO];

  return (
    <>
      {/* MÁSCARA ESCURA DE FUNDO */}
      <div 
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" 
        onClick={onClose} 
      />

      {/* DRAWER LATERAL */}
      <div className="w-[450px] bg-white shadow-2xl flex flex-col z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
        
        {/* CABEÇALHO */}
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Ficha do Paciente</h3>
            <p className="text-xs text-slate-500 mt-0.5">Gestão de Informações</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 text-xl font-light cursor-pointer"
          >
            ✕
          </button>
        </div>
        
        {/* CONTEÚDO DO FORMULÁRIO */}
        <div className="p-8 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* NOME COMPLETO */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome Completo</label>
            <input 
              type="text" 
              defaultValue={lead.name || ''} 
              onBlur={(e) => onUpdateLead('name', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>
          
          {/* WHATSAPP */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">WhatsApp</label>
            <input 
              type="text" 
              readOnly 
              value={formatarTelefone(lead.phone || lead.phone_number)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 outline-none cursor-not-allowed" 
            />
          </div>

          {/* UNIDADE E PROCEDIMENTO */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
              <select 
                value={lead.unidade || 'Pendente'} 
                onChange={(e) => onUpdateLead('unidade', e.target.value)} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
              >
                {['Pendente', ...LISTA_UNIDADES].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
              <select 
                value={procedimentoAtual} 
                onChange={(e) => onUpdateLead('procedimento', e.target.value)} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
              >
                {opcoesProcedimento.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* FEEDBACK DO PACIENTE */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Feedback do Paciente</label>
            <select 
              value={feedbackAtual} 
              onChange={(e) => onUpdateLead('feedback', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm font-medium cursor-pointer"
            >
              {opcoesFeedback.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* PROMOTOR / ORIGEM */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Promotor / Origem</label>
            <input 
              type="text" 
              defaultValue={lead.promotor || ''} 
              onBlur={(e) => onUpdateLead('promotor', e.target.value)} 
              placeholder="Ex: Passante de Rua..." 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>

          {/* ANOTAÇÕES INTERNAS */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Internas</label>
            <textarea 
              rows={4} 
              defaultValue={lead.notas_internas || ''} 
              onBlur={(e) => onUpdateLead('notas_internas', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm" 
              placeholder="Observações do atendimento clínico..." 
            />
          </div>

          {/* SEÇÃO FINANCEIRA / TRATAMENTO FECHADO */}
          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-4">
            <div>
              <label className="text-xs font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                <span>💰 Valor do Tratamento Fechado (R$)</span>
              </label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="Ex: 3500.00" 
                defaultValue={lead.valor_venda ?? ''} 
                onBlur={(e) => onUpdateLead('valor_venda', e.target.value ? Number(e.target.value) : null)} 
                className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-extrabold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm" 
              />
            </div>

            <div>
              <label className="text-xs font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                <span>📅 Data da Venda</span>
              </label>
              <input 
                type="date" 
                value={formatarDataInput(lead.data_venda)} 
                onChange={(e) => {
                  const isoStr = dateInputToISO(e.target.value);
                  onUpdateLead('data_venda', isoStr);
                }}
                className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-semibold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm cursor-pointer" 
              />
            </div>
          </div>
        </div>

        {/* RODAPÉ DO DRAWER COM AÇÕES */}
        <div className="p-6 border-t border-slate-100 bg-white">
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button"
              onClick={() => onUpdateLead('is_paused', !lead.is_paused)} 
              className={`py-2.5 rounded-lg font-bold text-xs transition-colors border cursor-pointer ${
                lead.is_paused 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {lead.is_paused ? '▶ Retomar Robô (IA)' : '⏸️ Pausar IA (Assumir)'}
            </button>
            
            <button 
              type="button"
              onClick={() => {
                if (onSelectLead) onSelectLead(lead);
              }} 
              className="py-2.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all shadow-sm cursor-pointer"
            >
              Abrir no Chat
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
