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
  
  // Estados para novo membro
  const [newMemberNome, setNewMemberNome] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPass, setNewMemberPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newMemberCargo, setNewMemberCargo] = useState('usuario');
  const [newMemberUnidade, setNewMemberUnidade] = useState('Todas');
  const [savingMember, setSavingMember] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [teamSuccess, setTeamSuccess] = useState('');

  // Estados para edição de membro existente
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('usuario');
  const [editUnidade, setEditUnidade] = useState('Todas');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Estados para exclusão
  const [memberToDelete, setMemberToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('dentup_profiles')
        .select('*')
        .order('nome', { ascending: true });
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
    if (isOpen) {
      fetchTeamMembers();
      setTeamError('');
      setTeamSuccess('');
    }
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
        setShowPassword(false);
        fetchTeamMembers();
      }
    } catch (err: any) {
      setTeamError('Ocorreu um erro na requisição.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleOpenEdit = (member: any) => {
    setEditingMember(member);
    setEditNome(member.nome || member.name || '');
    setEditEmail(member.email || '');
    setEditCargo(member.cargo || 'usuario');
    setEditUnidade(member.unidade || 'Todas');
    setEditPassword('');
    setShowEditPassword(false);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember?.id) return;
    setEditError('');
    setSavingEdit(true);

    try {
      const res = await fetch('/api/equipe', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMember.id,
          nome: editNome,
          email: editEmail,
          cargo: editCargo,
          unidade: editUnidade,
          password: editPassword.trim() ? editPassword.trim() : undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        setEditError(result.error || 'Erro ao atualizar colaborador.');
      } else {
        setTeamSuccess(`Colaborador ${editNome} atualizado com sucesso!`);
        setEditingMember(null);
        fetchTeamMembers();
      }
    } catch (err: any) {
      setEditError('Erro de comunicação ao salvar alterações.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete?.id) return;
    setDeleting(true);
    setTeamError('');
    setTeamSuccess('');

    try {
      const res = await fetch(`/api/equipe?id=${memberToDelete.id}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setTeamError(result.error || 'Erro ao excluir colaborador.');
      } else {
        setTeamSuccess(`Colaborador ${memberToDelete.nome || memberToDelete.email} removido com sucesso.`);
        setMemberToDelete(null);
        fetchTeamMembers();
      }
    } catch (err: any) {
      setTeamError('Erro de conexão ao excluir colaborador.');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO */}
        <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <div>
              <h2 className="text-lg font-bold">Gerenciar Equipe Dent'up</h2>
              <p className="text-xs text-blue-100 font-medium">Cadastre, edite permissões e gerencie os acessos do CRM</p>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-100 hover:text-white text-xl font-bold cursor-pointer">✕</button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          
          {/* MENSAGENS GERAIS */}
          {teamError && <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200 font-medium">{teamError}</div>}
          {teamSuccess && <div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded-lg border border-emerald-200 font-medium">{teamSuccess}</div>}

          {/* FORMULÁRIO DE NOVO COLABORADOR */}
          <form onSubmit={handleAddTeamMember} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
              <span>➕ Cadastrar Novo Colaborador</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ex: Ana Silva" 
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                  value={newMemberNome} 
                  onChange={e => setNewMemberNome(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">E-mail Corporativo</label>
                <input 
                  type="email" 
                  required 
                  placeholder="ana.dentup@gmail.com" 
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                  value={newMemberEmail} 
                  onChange={e => setNewMemberEmail(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Senha Inicial</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required 
                    minLength={6}
                    placeholder="Digite a senha (mín. 6 caracteres)" 
                    className="w-full px-3 py-2 pr-9 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                    value={newMemberPass} 
                    onChange={e => setNewMemberPass(e.target.value)} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Cargo / Função</label>
                <select 
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer" 
                  value={newMemberCargo} 
                  onChange={e => setNewMemberCargo(e.target.value)}
                >
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
                <select 
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer" 
                  value={newMemberUnidade} 
                  onChange={e => setNewMemberUnidade(e.target.value)}
                >
                  <option value="Todas">Todas as Unidades</option>
                  <option value="Diadema">Diadema</option>
                  <option value="Mauá">Mauá</option>
                  <option value="Santo André">Santo André</option>
                  <option value="São Mateus">São Mateus</option>
                </select>
              </div>
              <button 
                type="submit" 
                disabled={savingMember} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm mt-5 disabled:opacity-50 cursor-pointer"
              >
                {savingMember ? 'Cadastrando...' : '+ Adicionar Membro'}
              </button>
            </div>
          </form>

          {/* LISTA DE COLABORADORES */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-800">
                Membros da Equipe ({teamMembers.length})
              </h3>
              <span className="text-xs text-slate-400">Total de acessos ativos no CRM</span>
            </div>
            
            <div className="border rounded-xl overflow-hidden border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Nome / E-mail</th>
                    <th className="p-3">Cargo</th>
                    <th className="p-3">Unidade</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamMembers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        Nenhum colaborador encontrado.
                      </td>
                    </tr>
                  ) : (
                    teamMembers.map((m, idx) => {
                      const cargoLower = (m.cargo || '').toLowerCase();
                      const isAdmin = cargoLower.includes('admin');
                      const isGerente = cargoLower.includes('gerente');

                      return (
                        <tr key={m.id || m.email || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <p className="font-bold text-slate-800">{m.nome || m.name || 'Sem Nome'}</p>
                            <p className="text-slate-400 text-[11px]">{m.email}</p>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              isAdmin 
                                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                                : isGerente
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {m.cargo || 'atendente'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {m.unidade || 'Todas'}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* BOTÃO EDITAR */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(m)}
                                className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                                title="Editar dados do colaborador"
                              >
                                <span>✏️</span>
                                <span>Editar</span>
                              </button>

                              {/* BOTÃO EXCLUIR */}
                              <button
                                type="button"
                                onClick={() => setMemberToDelete(m)}
                                className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                                title="Excluir colaborador"
                              >
                                <span>🗑️</span>
                                <span>Excluir</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RODAPÉ DO MODAL PRINCIPAL */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 text-right">
          <button 
            onClick={onClose} 
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* MODAL DE EDIÇÃO DO MEMBRO */}
      {editingMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 text-white flex justify-between items-center">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>✏️ Editar Colaborador</span>
              </h3>
              <button 
                onClick={() => setEditingMember(null)} 
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200 font-medium">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cargo / Função</label>
                  <select
                    value={editCargo}
                    onChange={(e) => setEditCargo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                  >
                    <option value="usuario">Atendente / Recepção</option>
                    <option value="gerente">Gerente de Unidade</option>
                    <option value="admin">Administrador Geral</option>
                    <option value="promotor">Promotor / Divulgador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unidade</label>
                  <select
                    value={editUnidade}
                    onChange={(e) => setEditUnidade(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                  >
                    <option value="Todas">Todas as Unidades</option>
                    <option value="Diadema">Diadema</option>
                    <option value="Mauá">Mauá</option>
                    <option value="Santo André">Santo André</option>
                    <option value="São Mateus">São Mateus</option>
                  </select>
                </div>
              </div>

              {/* RESET DE SENHA (OPCIONAL) */}
              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/80">
                <label className="block text-xs font-bold text-amber-900 mb-1">
                  Redefinir Senha de Acesso (Opcional)
                </label>
                <p className="text-[11px] text-amber-700 mb-2">
                  Deixe em branco para manter a senha atual do colaborador.
                </p>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    minLength={6}
                    placeholder="Digite a nova senha (mín. 6 caracteres)"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 text-xs border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showEditPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {memberToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-800">
                  Excluir Colaborador?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Você está prestes a remover o acesso de <strong className="text-slate-800">{memberToDelete.nome || memberToDelete.email}</strong>.
                </p>
                <p className="text-[11px] text-red-600 font-semibold mt-2 bg-red-50 p-2 rounded-lg border border-red-100">
                  Esta ação removerá o login do colaborador e não poderá ser desfeita.
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setMemberToDelete(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteMember}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {deleting ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
