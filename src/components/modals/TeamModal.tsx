// File: src/components/modals/TeamModal.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TeamModal({ isOpen, onClose }: TeamModalProps) {
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [newMemberNome, setNewMemberNome] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPass, setNewMemberPass] = useState('');
  const [newMemberCargo, setNewMemberCargo] = useState('usuario');
  const [newMemberUnidade, setNewMemberUnidade] = useState('Todas');
  const [savingMember, setSavingMember] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [teamSuccess, setTeamSuccess] = useState('');

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase.from('dentup_profiles').select('*').order('nome', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        setTeamMembers(data);
        return;
      }
    } catch (_) {}
    try {
      const res = await fetch('/api/equipe');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          setTeamMembers(json.data);
          return;
        }
      }
    } catch (_) {}
    setTeamMembers([]);
  };

  useEffect(() => {
    if (isOpen) fetchTeamMembers();
  }, [isOpen]);

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError('');
    setTeamSuccess('');
    setSavingMember(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${session?.access_token || ''}` 
        },
        body: JSON.stringify({ 
          nome: newMemberNome, 
          email: newMemberEmail, 
          password: newMemberPass, 
          cargo: newMemberCargo, 
          unidade: newMemberUnidade 
        }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setTeamError(result.error || 'Erro ao cadastrar usuário.');
      } else {
        setTeamSuccess('Usuário cadastrado com sucesso!');
        setNewMemberNome(''); 
        setNewMemberEmail(''); 
        setNewMemberPass('');
        fetchTeamMembers();
      }
    } catch (err: any) {
      setTeamError('Ocorreu um erro na requisição.');
    } finally {
      setSavingMember(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h2 className="text-lg font-bold">Gerenciar Equipe Dent'up</h2>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white text-xl font-bold cursor-pointer">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          <form onSubmit={handleAddTeamMember} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Cadastrar Novo Colaborador</h3>

            {teamError && <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200 font-medium">{teamError}</div>}
            {teamSuccess && <div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded-lg border border-emerald-200 font-medium">{teamSuccess}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nome Completo</label>
                <input type="text" required placeholder="Ex: Ana Silva" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={newMemberNome} onChange={e => setNewMemberNome(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">E-mail Corporativo</label>
                <input type="email" required placeholder="ana.dentup@gmail.com" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Senha Inicial</label>
                <input type="password" placeholder="•••••••• (opcional)" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={newMemberPass} onChange={e => setNewMemberPass(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Cargo / Função</label>
                <select className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer" value={newMemberCargo} onChange={e => setNewMemberCargo(e.target.value)}>
                  <option value="usuario">Atendente / Recepção</option>
                  <option value="gerente">Gerente de Unidade</option>
                  <option value="admin">Administrador Geral</option>
                  <option value="promotor">Promotor / Divulgador</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="w-1/2 pr-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">Unidade</label>
                <select className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer" value={newMemberUnidade} onChange={e => setNewMemberUnidade(e.target.value)}>
                  <option value="Todas">Todas as Unidades</option>
                  <option value="Diadema">Diadema</option>
                  <option value="Mauá">Mauá</option>
                  <option value="Santo André">Santo André</option>
                  <option value="São Mateus">São Mateus</option>
                </select>
              </div>
              <button type="submit" disabled={savingMember} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm mt-5 disabled:opacity-50 cursor-pointer">
                {savingMember ? 'Cadastrando...' : '+ Adicionar Membro'}
              </button>
            </div>
          </form>

          {/* LISTA DE COLABORADORES */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Membros da Equipe ({teamMembers.length})</h3>
            <div className="border rounded-xl overflow-hidden border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Nome / E-mail</th>
                    <th className="p-3">Cargo</th>
                    <th className="p-3">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamMembers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-400">Nenhum colaborador encontrado.</td>
                    </tr>
                  ) : (
                    teamMembers.map((m, idx) => (
                      <tr key={m.id || m.email || idx} className="hover:bg-slate-50">
                        <td className="p-3">
                          <p className="font-bold text-slate-800">{m.nome || m.name || 'Sem Nome'}</p>
                          <p className="text-slate-400 text-[11px]">{m.email}</p>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            (m.cargo?.toLowerCase() === 'admin' || m.cargo?.toLowerCase() === 'administrador') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>{m.cargo || 'atendente'}</span>
                        </td>
                        <td className="p-3 text-slate-600 font-medium">{m.unidade || 'Todas'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 text-right">
          <button onClick={onClose} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}