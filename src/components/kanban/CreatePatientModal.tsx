// File: src/components/kanban/CreatePatientModal.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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

interface CreatePatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (newPatient: any) => void;
  isAdmin: boolean;
  userUnidade?: string;
}

export default function CreatePatientModal({
  isOpen,
  onClose,
  onPatientCreated,
  isAdmin,
  userUnidade = 'Santo André'
}: CreatePatientModalProps) {
  const defaultUnidade = !isAdmin && userUnidade && userUnidade !== 'all' && userUnidade !== 'Todas'
    ? userUnidade
    : 'Santo André';

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    unidade: defaultUnidade,
    procedimento: 'Avaliação Geral',
    promotor: 'Passante de Rua',
    notas_internas: '',
    valor_venda: ''
  });

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: '',
        phone: '',
        unidade: defaultUnidade,
        procedimento: 'Avaliação Geral',
        promotor: 'Passante de Rua',
        notas_internas: '',
        valor_venda: ''
      });
    }
  }, [isOpen, defaultUnidade]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      alert('Por favor, preencha o Nome e o WhatsApp do paciente.');
      return;
    }

    setSaving(true);
    const cleanPhone = form.phone.replace(/\D/g, '');
    const agoraISO = new Date().toISOString();

    const payload = {
      name: form.name.trim(),
      phone: cleanPhone,
      unidade: form.unidade,
      procedimento: form.procedimento,
      promotor: form.promotor,
      notas_internas: form.notas_internas,
      valor_venda: form.valor_venda ? Number(form.valor_venda) : null,
      status: 'novo',
      is_paused: true,
      created_at: agoraISO,
      data_movimentacao: agoraISO
    };

    const { data, error } = await supabase
      .from('dentup_leads')
      .insert([payload])
      .select();

    setSaving(false);

    if (error) {
      if (error.message?.includes('duplicate key') || error.code === '23505') {
        alert('⚠️ Este paciente ou número de WhatsApp já está cadastrado no CRM!');
      } else {
        alert('Erro ao cadastrar paciente: ' + error.message);
      }
      return;
    }

    if (data && data.length > 0) {
      onPatientCreated(data[0]);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Cadastrar Novo Paciente</h3>
            <p className="text-xs text-slate-500">Adicione um novo lead manualmente no CRM</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 text-lg font-light cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">
              Nome Completo <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              required 
              placeholder="Ex: Maria Silva" 
              value={form.name} 
              onChange={(e) => setForm({ ...form, name: e.target.value })} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">
              WhatsApp / Telefone <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              required 
              placeholder="Ex: (11) 99999-8888" 
              value={form.phone} 
              onChange={(e) => setForm({ ...form, phone: e.target.value })} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
              <select 
                disabled={!isAdmin && userUnidade !== 'Todas' && userUnidade !== 'all'} 
                value={form.unidade} 
                onChange={(e) => setForm({ ...form, unidade: e.target.value })} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                {LISTA_UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
              <select 
                value={form.procedimento} 
                onChange={(e) => setForm({ ...form, procedimento: e.target.value })} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
              >
                {OPCOES_PROCEDIMENTO_PADRAO.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Promotor / Origem</label>
              <input 
                type="text" 
                placeholder="Ex: Passante de Rua" 
                value={form.promotor} 
                onChange={(e) => setForm({ ...form, promotor: e.target.value })} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Valor Venda (R$)</label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="Ex: 1500.00" 
                value={form.valor_venda} 
                onChange={(e) => setForm({ ...form, valor_venda: e.target.value })} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" 
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Internas</label>
            <textarea 
              rows={3} 
              placeholder="Observações iniciais do atendimento..." 
              value={form.notas_internas} 
              onChange={(e) => setForm({ ...form, notas_internas: e.target.value })} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm" 
            />
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={saving} 
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Cadastrar Paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}