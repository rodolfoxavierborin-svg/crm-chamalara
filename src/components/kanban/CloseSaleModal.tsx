// File: src/components/kanban/CloseSaleModal.tsx
"use client";

import React, { useState, useEffect } from 'react';
import {
  parseValorMonetario,
  formatarMoeda,
  isLeadAgendadoPelaLara,
  obterVoucherDoLead
} from '../../utils/kanbanUtils';

interface CloseSaleModalProps {
  lead: any;
  profiles: any[];
  userProfile?: any;
  onClose: () => void;
  onConfirmSale: (dados: {
    valor_venda: number;
    vendedor_id: string | null;
    vendedor_nome: string;
    procedimento: string;
    data_venda: string;
    voucher?: string | null;
    tipo_agendamento: string;
    agendado_por: string;
  }) => Promise<void> | void;
}

const OPCOES_PROCEDIMENTO = [
  'Avaliação Geral',
  'Implante Dentário',
  'Prótese Dentária',
  'Aparelho Ortodôntico',
  'Alinhadores Invisíveis',
  'Lentes de Contato / Facetas',
  'Clareamento Dental',
  'Canal (Endodontia)',
  'Limpeza / Profilaxia',
  'Extração / Cirurgia',
  'Odontopediatria',
  'Estética Orofacial',
];

export default function CloseSaleModal({
  lead,
  profiles = [],
  userProfile,
  onClose,
  onConfirmSale,
}: CloseSaleModalProps) {
  const agendadoPorLara = isLeadAgendadoPelaLara(lead);
  const voucherDetectado = obterVoucherDoLead(lead);

  const valorInicial = parseValorMonetario(lead?.valor_venda);
  const [valorStr, setValorStr] = useState(
    valorInicial > 0 ? String(valorInicial).replace('.', ',') : ''
  );

  // Vendedor selecionado: usa apenas vendedor_nome já salvo, forçando escolha consciente se vazio
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>(() => {
    if (lead?.vendedor_id) return String(lead.vendedor_id);
    if (lead?.vendedor_nome) {
      const found = profiles.find(
        (p) => (p.nome || '').toLowerCase().trim() === String(lead.vendedor_nome).toLowerCase().trim()
      );
      if (found) return String(found.id);
      return `custom:${lead.vendedor_nome}`;
    }
    return '';
  });

  const [procedimento, setProcedimento] = useState<string>(
    lead?.procedimento || lead?.interesse || 'Avaliação Geral'
  );

  const [dataVendaInput, setDataVendaInput] = useState<string>(() => {
    if (lead?.data_venda) {
      const d = new Date(lead.data_venda);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      }
    }
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  });

  const [erro, setErro] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!vendedorSelecionado && lead?.vendedor_nome && profiles.length > 0) {
      const found = profiles.find(
        (p) => (p.nome || '').toLowerCase().trim() === String(lead.vendedor_nome).toLowerCase().trim()
      );
      if (found) setVendedorSelecionado(String(found.id));
    }
  }, [profiles, lead?.vendedor_nome, vendedorSelecionado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    const valorNum = parseValorMonetario(valorStr);
    if (!valorNum || valorNum <= 0) {
      setErro('Informe um valor válido maior que R$ 0,00 para o tratamento fechado.');
      return;
    }

    if (!vendedorSelecionado) {
      setErro('Selecione quem realizou o fechamento comercial na clínica.');
      return;
    }

    let vendedorIdFinal: string | null = null;
    let vendedorNomeFinal = 'Equipe da Recepção / Clínicas';

    if (vendedorSelecionado === 'equipe_geral') {
      vendedorIdFinal = null;
      vendedorNomeFinal = 'Equipe da Recepção / Clínicas';
    } else if (vendedorSelecionado.startsWith('custom:')) {
      vendedorIdFinal = null;
      vendedorNomeFinal = vendedorSelecionado.replace('custom:', '');
    } else {
      const perfil = profiles.find((p) => String(p.id) === String(vendedorSelecionado));
      if (perfil) {
        vendedorIdFinal = perfil.id;
        vendedorNomeFinal = perfil.nome || perfil.email || 'Colaborador';
      } else if (userProfile && String(userProfile.id) === String(vendedorSelecionado)) {
        vendedorIdFinal = userProfile.id;
        vendedorNomeFinal = userProfile.nome || userProfile.email || 'Colaborador';
      }
    }

    const dataVendaISO = `${dataVendaInput}T12:00:00-03:00`;

    // Preservação 100% blindada do agendamento original
    const tipoAgendamentoFinal = agendadoPorLara ? 'lara' : (lead?.tipo_agendamento || 'clinica');
    const agendadoPorFinal = agendadoPorLara
      ? 'Lara (IA)'
      : (lead?.agendado_por || userProfile?.nome || 'Recepção');

    try {
      setSalvando(true);
      await onConfirmSale({
        valor_venda: valorNum,
        vendedor_id: vendedorIdFinal,
        vendedor_nome: vendedorNomeFinal,
        procedimento,
        data_venda: dataVendaISO,
        voucher: agendadoPorLara ? voucherDetectado : (lead?.voucher || null),
        tipo_agendamento: tipoAgendamentoFinal,
        agendado_por: agendadoPorFinal,
      });
    } finally {
      setSalvando(false);
    }
  };

  const listaProcedimentos = OPCOES_PROCEDIMENTO.includes(procedimento)
    ? OPCOES_PROCEDIMENTO
    : [procedimento, ...OPCOES_PROCEDIMENTO];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">💰</span>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                Confirmar Tratamento Fechado
              </h3>
              <p className="text-[11px] text-teal-100 font-medium">
                Registro auditado de conversão comercial na clínica
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* IDENTIFICAÇÃO DO PACIENTE E SELO IMUTÁVEL DE ORIGEM DO AGENDAMENTO */}
          <div className={`p-4 rounded-xl border ${
            agendadoPorLara
              ? 'bg-indigo-50/70 border-indigo-200'
              : 'bg-emerald-50/60 border-emerald-200'
          }`}>
            <div className="flex justify-between items-start gap-2 mb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Paciente
                </span>
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {lead?.name || 'Paciente'}
                </h4>
              </div>

              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase flex items-center gap-1 border shadow-2xs ${
                agendadoPorLara
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-emerald-700 text-white border-emerald-800'
              }`}>
                {agendadoPorLara ? (
                  <><span>🤖</span> Agendado pela Lara (IA) 🔒</>
                ) : (
                  <><span>🏥</span> Agendado pela Clínica</>
                )}
              </span>
            </div>

            {agendadoPorLara ? (
              <div className="pt-2 border-t border-indigo-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
                  <span>🎟️ Voucher VIP:</span>
                  <span className="px-2 py-0.5 bg-white border border-indigo-300 rounded font-mono text-indigo-700 font-black">
                    {voucherDetectado || 'CONFIRMADO'}
                  </span>
                </div>
                <span className="text-[10px] text-indigo-700 font-semibold italic">
                  ✓ O mérito do agendamento permanece 100% com a Lara
                </span>
              </div>
            ) : (
              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs text-emerald-900">
                <span>
                  Agendado por: <strong>{lead?.agendado_por || 'Recepção'}</strong>
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold italic">
                  ✓ Origem preservada
                </span>
              </div>
            )}
          </div>

          {erro && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>{erro}</span>
            </div>
          )}

          {/* CAMPO 1: VALOR DO TRATAMENTO FECHADO */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1.5">
              1. Valor Total do Tratamento Fechado (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-700">
                R$
              </span>
              <input
                type="text"
                autoFocus
                placeholder="Ex: 1.500,00"
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-emerald-50/40 border-2 border-emerald-300 rounded-xl text-base font-black text-emerald-800 outline-none focus:border-emerald-600 focus:bg-white transition-all"
              />
            </div>
            {parseValorMonetario(valorStr) > 0 && (
              <p className="text-[11px] font-bold text-emerald-600 mt-1">
                Valor reconhecido: {formatarMoeda(parseValorMonetario(valorStr))}
              </p>
            )}
          </div>

          {/* CAMPO 2: QUEM VENDEU NA CLÍNICA (CLOSER) */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1.5">
              2. Quem realizou o Fechamento na Clínica? (Vendedor / Closer) *
            </label>
            <select
              value={vendedorSelecionado}
              onChange={(e) => setVendedorSelecionado(e.target.value)}
              className="w-full p-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-teal-600 cursor-pointer"
            >
              <option value="">-- Selecione o responsável pelo fechamento na clínica --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  👤 {p.nome || p.email} ({(p.cargo || 'Colaborador').toUpperCase()} - {p.unidade || 'Todas'})
                </option>
              ))}
              <option value="equipe_geral">
                🏥 Equipe da Recepção / Clínica Geral (Sem vendedor individual)
              </option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Define quem negociou e fechou o contrato presencialmente na clínica.{' '}
              <strong>Não altera o mérito de quem realizou o agendamento.</strong>
            </p>
          </div>

          {/* CAMPO 3 E 4: PROCEDIMENTO E DATA DA VENDA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Procedimento Fechado
              </label>
              <select
                value={procedimento}
                onChange={(e) => setProcedimento(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-teal-600"
              >
                {listaProcedimentos.map((proc) => (
                  <option key={proc} value={proc}>
                    {proc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Data do Fechamento
              </label>
              <input
                type="date"
                value={dataVendaInput}
                onChange={(e) => setDataVendaInput(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-teal-600 cursor-pointer"
              />
            </div>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>✅</span>
              <span>{salvando ? 'Registrando Venda...' : 'Confirmar Venda Fechada'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
