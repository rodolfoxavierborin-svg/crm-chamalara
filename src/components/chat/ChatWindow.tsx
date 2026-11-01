// File: src/components/chat/ChatWindow.tsx

"use client";

import React, { useState, RefObject } from 'react';
import { parseDataSegura } from '../../utils/dateUtils';

const MOTIVOS_PAUSA_PADRAO = [
  'Paciente solicitou falar com atendente humano',
  'Dúvida clínica específica / fora do escopo da IA',
  'Negociação de valores / condições de pagamento',
  'Paciente compareceu presencialmente à clínica',
  'Agendamento complexo ou encaixe de emergência',
  'Outro motivo'
];

interface ChatWindowProps {
  selectedLead: any | null;
  onBackMobile: () => void;
  onTogglePauseAI: (motivo?: string) => void;
  messages: any[];
  isMensagemTecnica: (msg: any) => boolean;
  parseMensagem: (msg: any) => { type: string; content: string; isTool: boolean };
  formatDateSeparator: (dataIso: string | Date) => string;
  newMessage: string;
  setNewMessage: (value: string) => void;
  onSendMessage: (motivo?: string) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  userProfile?: any;
}

export default function ChatWindow({
  selectedLead,
  onBackMobile,
  onTogglePauseAI,
  messages,
  isMensagemTecnica,
  parseMensagem,
  formatDateSeparator,
  newMessage,
  setNewMessage,
  onSendMessage,
  messagesEndRef,
  userProfile,
}: ChatWindowProps) {
  let lastDateGroup = '';

  // Modal de justificativa antifraude da IA Lara
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState(MOTIVOS_PAUSA_PADRAO[0]);
  const [motivoPausaOutro, setMotivoPausaOutro] = useState('');
  const [isTriggeredBySend, setIsTriggeredBySend] = useState(false);

  // Ação ao clicar no botão de assumir chat
  const handleButtonClick = () => {
    if (!selectedLead) return;
    if (!selectedLead.is_paused) {
      setIsTriggeredBySend(false);
      setShowPauseModal(true);
    } else {
      onTogglePauseAI();
    }
  };

  // Tentativa de envio de mensagem
  const handleTrySendMessage = () => {
    if (!newMessage.trim() || !selectedLead) return;
    if (!selectedLead.is_paused) {
      // Se a IA ainda estiver ativa, exige o motivo antes de disparar a mensagem
      setIsTriggeredBySend(true);
      setShowPauseModal(true);
    } else {
      onSendMessage();
    }
  };

  // Confirmação do motivo da pausa
  const handleConfirmPauseAI = () => {
    const motivoFinal = motivoPausa === 'Outro motivo'
      ? (motivoPausaOutro.trim() || 'Outro motivo não especificado')
      : motivoPausa;

    setShowPauseModal(false);

    if (isTriggeredBySend) {
      onSendMessage(motivoFinal);
    } else {
      onTogglePauseAI(motivoFinal);
    }
  };

  return (
    <div className={`flex-1 flex-col bg-[#EFEAE2] relative ${selectedLead ? 'flex' : 'hidden md:flex'}`}>
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}
      ></div>

      {selectedLead ? (
        <>
          {/* CABEÇALHO DO CHAT ATIVO */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 h-[56px] md:h-[60px] shrink-0 flex justify-between items-center z-10">
            <div className="flex items-center gap-3">
              <button onClick={onBackMobile} className="md:hidden text-slate-500 pr-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic ? (
                <img
                  src={selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic}
                  alt={selectedLead.name}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm md:text-base">
                  {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : 'P'}
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs md:text-sm font-bold text-slate-800">
                    {selectedLead.name || 'Sem Nome'}
                  </h2>

                  {/* BADGE DE STATUS (IA OU ATENDENTE HUMANO) */}
                  {selectedLead.is_paused ? (
                    <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                      <span>👤</span>
                      <span>{selectedLead.responsavel_nome || 'Atendente'}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                      <span>🤖</span>
                      <span>Lara (IA)</span>
                    </span>
                  )}
                </div>
                <span className="text-[11px] md:text-xs text-slate-500">
                  {selectedLead.phone || selectedLead.phone_number}
                </span>
              </div>
            </div>

            {/* BOTÃO ASSUMIR CHAT / RETOMAR COM TRAVA ANTIFRAUDE */}
            <button
              onClick={handleButtonClick}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs transition-all border shadow-sm notranslate cursor-pointer flex items-center gap-1.5 ${
                selectedLead.is_paused
                  ? 'bg-red-500 text-white border-red-600 hover:bg-red-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{selectedLead.is_paused ? '▶' : '⏸️'}</span>
              <span>{selectedLead.is_paused ? 'Retomar IA' : 'Assumir Chat'}</span>
            </button>
          </div>

          {/* CORPO DO HISTÓRICO DE MENSAGENS */}
          <div className="flex-1 overflow-y-auto p-3 md:p-4 relative z-10 custom-scrollbar">
            <div className="flex flex-col space-y-3 pb-4">
              {messages.map((msg) => {
                if (isMensagemTecnica(msg)) return null;

                const msSeguro = parseDataSegura(msg.created_at) || Date.now();
                const msgDate = new Date(msSeguro);

                const currentDateGroup = msgDate.toLocaleDateString('pt-BR');
                const isNewDate = currentDateGroup !== lastDateGroup;

                if (isNewDate) lastDateGroup = currentDateGroup;

                const { type, content } = parseMensagem(msg);
                const isPatient = type === 'human' || type === 'user';
                const isAI = type === 'ai' || type === 'assistant';
                const baloes = (content || '')
                  .split('###')
                  .map((t: string) => t.trim())
                  .filter((t: string) => t.length > 0);

                return (
                  <React.Fragment key={msg.id}>
                    {isNewDate && (
                      <div className="flex justify-center my-4 opacity-90">
                        <span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-[11px] font-bold px-3 py-1 rounded-lg shadow-sm uppercase tracking-wide">
                          {formatDateSeparator(msgDate)}
                        </span>
                      </div>
                    )}

                    {baloes.map((texto: string, index: number) => {
                      return (
                        <div
                          key={`${msg.id}-${index}`}
                          className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[85%] md:max-w-md rounded-2xl p-3 shadow-sm relative ${
                              isPatient
                                ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100/80'
                                : 'bg-[#D9FDD3] text-slate-800 rounded-tr-none'
                            }`}
                          >
                            <span
                              className={`block text-[11px] font-bold mb-1 notranslate ${
                                isPatient
                                  ? 'text-slate-400'
                                  : isAI
                                  ? 'text-emerald-700'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {isPatient ? 'Paciente' : isAI ? 'Lara (IA)' : 'Você (Atendente)'}
                            </span>
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {texto}
                            </p>
                            <span
                              className="block text-[10px] text-right mt-1.5 text-slate-400"
                              title={msgDate.toLocaleString('pt-BR')}
                            >
                              {msgDate.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* CAMPO DE DIGITAÇÃO E ENVIO */}
          <div className="p-2.5 md:p-3 bg-slate-50 h-[58px] md:h-[64px] shrink-0 flex items-center z-10 border-t border-slate-200">
            <div className="flex items-center space-x-2 w-full max-w-5xl mx-auto">
              <div className="flex-1 bg-white rounded-full p-1 md:p-1.5 flex items-center shadow-sm border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                <input
                  type="text"
                  placeholder="Digite uma mensagem..."
                  className="flex-1 bg-transparent px-3 py-1 text-sm text-slate-800 outline-none"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleTrySendMessage()}
                />
              </div>
              <button
                onClick={handleTrySendMessage}
                className="bg-[#00A884] text-white w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#008f70] transition-colors shadow-sm shrink-0 cursor-pointer"
              >
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        /* TELA VAZIA QUANDO NENHUM PACIENTE ESTÁ SELECIONADO */
        <div className="flex flex-1 items-center justify-center bg-[#EFEAE2] z-10">
          <div className="text-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <img src="/logo.png" alt="Dent'up Odonto" className="h-14 w-auto mx-auto mb-3 object-contain" />
            <h3 className="text-lg font-bold text-slate-800 mb-1 notranslate">Dent'up Inbox</h3>
            <p className="text-sm text-slate-500">
              Selecione uma conversa à esquerda<br />para iniciar o atendimento.
            </p>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO & JUSTIFICATIVA OBRIGATÓRIA NO CHAT (TRAVA ANTIFRAUDE) */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="text-sm font-bold">Interromper IA Lara e Assumir Chat?</h3>
              </div>
              <button 
                onClick={() => setShowPauseModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                A <strong>Lara (IA)</strong> está conduzindo este paciente no WhatsApp. Para garantir a transparência da equipe e manter o histórico auditado, informe o motivo da intervenção humana:
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motivo da Pausa:
                </label>
                <select
                  value={motivoPausa}
                  onChange={(e) => setMotivoPausa(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                >
                  {MOTIVOS_PAUSA_PADRAO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {motivoPausa === 'Outro motivo' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Especifique o motivo:
                  </label>
                  <textarea
                    rows={2}
                    value={motivoPausaOutro}
                    onChange={(e) => setMotivoPausaOutro(e.target.value)}
                    placeholder="Descreva o motivo da intervenção..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm"
                  />
                </div>
              )}

              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[11px] text-amber-800">
                <span>🛡️ O atendimento será atribuído a <strong>{userProfile?.nome || 'Seu Usuário'}</strong> com data e motivo registrados no sistema.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPauseAI}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-sm cursor-pointer"
                >
                  Confirmar e Assumir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
