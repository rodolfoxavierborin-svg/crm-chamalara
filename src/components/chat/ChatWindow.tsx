// File: src/components/chat/ChatWindow.tsx

"use client";

import React, { useState, RefObject } from 'react';
import { parseDataSegura } from '../../utils/dateUtils';
import { buildWhatsAppLink, buildDentupGreeting } from '../../utils/formatters';

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
    <div className={`flex-1 h-full min-h-0 flex-col bg-[#EFEAE2] relative ${selectedLead ? 'flex' : 'hidden md:flex'}`}>
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}
      ></div>

      {selectedLead ? (
        <>
          {/* CABEÇALHO DO CHAT ATIVO */}
          <div className="bg-slate-50 border-b border-slate-200 px-3 md:px-4 pt-[env(safe-area-inset-top)] min-h-[56px] md:h-[60px] shrink-0 flex justify-between items-center gap-2 z-10 shadow-2xs">
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={onBackMobile}
                aria-label="Voltar para conversas"
                className="md:hidden w-10 h-10 -ml-1.5 flex items-center justify-center rounded-full text-slate-600 active:bg-slate-200 shrink-0 cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic ? (
                <img
                  src={selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic}
                  alt={selectedLead.name}
                  className="w-9 h-9 rounded-full object-cover shadow-sm shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm md:text-base shrink-0">
                  {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : 'P'}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-xs md:text-sm font-bold text-slate-800 truncate">
                    {selectedLead.name || 'Sem Nome'}
                  </h2>

                  {/* BADGE DE STATUS (IA OU ATENDENTE HUMANO) */}
                  {selectedLead.is_paused ? (
                    <span className="text-[10px] font-bold bg-slate-900 text-white px-1.5 md:px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 max-w-[110px] sm:max-w-none">
                      <span>👤</span>
                      <span className="truncate">{selectedLead.responsavel_nome || 'Atendente'}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 md:px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                      <span>🤖</span>
                      <span className="hidden xs:inline sm:inline">Lara (IA)</span>
                      <span className="xs:hidden sm:hidden">IA</span>
                    </span>
                  )}
                </div>
                {(() => {
                  const waLink = buildWhatsAppLink(
                    selectedLead.phone || selectedLead.phone_number,
                    buildDentupGreeting(selectedLead.name)
                  );
                  const phoneDisplay = selectedLead.phone || selectedLead.phone_number;
                  if (!waLink) {
                    return (
                      <span className="text-[11px] md:text-xs text-slate-500 block truncate">
                        {phoneDisplay}
                      </span>
                    );
                  }
                  return (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir no WhatsApp do seu aparelho"
                      className="inline-flex items-center gap-1 text-[11px] md:text-xs text-emerald-700 hover:text-emerald-800 font-semibold max-w-full truncate"
                    >
                      <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.531.078-1.203.109-1.938-.125-.453-.141-1.031-.328-1.766-.641-3.109-1.344-5.141-4.484-5.297-4.688-.156-.203-1.266-1.688-1.266-3.219s.797-2.281 1.078-2.594c.281-.313.609-.391.813-.391.203 0 .406 0 .578.016.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.031.547-.094.203-.141.328-.297.5-.156.172-.328.391-.469.531-.156.156-.313.328-.141.641.172.313.781 1.297 1.672 2.094 1.156 1.031 2.125 1.359 2.438 1.516.313.156.484.125.672-.078.188-.203.766-.891.969-1.203.203-.313.406-.266.688-.156.281.109 1.797.844 2.109 1 .313.156.516.234.594.359.078.125.078.734-.172 1.438z" />
                      </svg>
                      <span className="truncate underline decoration-emerald-300 underline-offset-2">{phoneDisplay}</span>
                    </a>
                  );
                })()}
              </div>
            </div>

            {/* BOTÃO ASSUMIR CHAT / RETOMAR COM TRAVA ANTIFRAUDE */}
            <button
              type="button"
              onClick={handleButtonClick}
              className={`px-2.5 py-2 md:px-4 md:py-2 rounded-lg font-bold text-[11px] md:text-xs transition-all border shadow-sm notranslate cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
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
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-scroll p-3 md:p-4 relative z-10 custom-scrollbar">
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
          <div className="px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:p-3 bg-slate-50 min-h-[58px] md:min-h-[64px] shrink-0 flex items-center z-10 border-t border-slate-200">
            <div className="flex items-center space-x-2 w-full max-w-5xl mx-auto">
              <div className="flex-1 bg-white rounded-full px-1.5 py-1.5 flex items-center shadow-sm border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                <input
                  type="text"
                  enterKeyHint="send"
                  placeholder="Digite uma mensagem..."
                  className="flex-1 bg-transparent px-3 py-1 text-base md:text-sm text-slate-800 outline-none"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTrySendMessage();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleTrySendMessage}
                aria-label="Enviar mensagem"
                className="bg-[#00A884] text-white w-11 h-11 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#008f70] active:scale-95 transition-all shadow-sm shrink-0 cursor-pointer"
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
        <div className="flex flex-1 items-center justify-center bg-[#EFEAE2] z-10 p-4">
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-5 sm:px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="text-sm font-bold">Interromper IA Lara e Assumir Chat?</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="text-slate-400 hover:text-white font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 overflow-y-auto touch-scroll">
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
