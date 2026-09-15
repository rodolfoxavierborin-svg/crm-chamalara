{/* Histórico de Mensagens */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.map((msg) => {
                      const msgType = msg.message?.type || msg.type;
                      const msgContent = msg.message?.content || msg.content;

                      if (!msgContent || typeof msgContent !== 'string') return null;

                      const trimmed = msgContent.trim();
                      if (trimmed.startsWith('[{') || trimmed.startsWith('{"')) return null;
                      if (msgContent.includes('Calling Create_an_event') || msgContent.includes('Calling Buscar')) return null;

                      const isPatient = msgType === 'human' || msgType === 'user';
                      const isAI = msgType === 'ai' || msgType === 'assistant';

                      // LÓGICA SÊNIOR: Fatia a mensagem caso exista o "###"
                      const partesMensagem = msgContent.split('###').map(p => p.trim()).filter(p => p.length > 0);

                      return (
                        <React.Fragment key={msg.id}>
                          {partesMensagem.map((parte, index) => (
                            <div
                              key={`${msg.id}-${index}`}
                              className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}
                            >
                              <div
                                className={`max-w-[85%] md:max-w-xs rounded-lg p-3 shadow-sm ${
                                  isPatient
                                    ? 'bg-white text-gray-800 border'
                                    : isAI
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                <span className="block text-xs font-semibold mb-1 opacity-75">
                                  {isPatient ? 'Paciente' : isAI ? 'Lara (IA)' : 'Atendente'}
                                </span>
                                <p className="text-sm whitespace-pre-wrap break-words">{parte}</p>
                                <span className="mt-1 block text-[10px] opacity-75 text-right">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>