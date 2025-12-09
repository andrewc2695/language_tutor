'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import styles from './Chat.module.css';

export function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userInput = input;
    setInput('');
    await sendMessage({ text: userInput });
  };

  const getMessageText = (message: typeof messages[0]) => {
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as { text: string }).text)
      .join('');
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messagesContainer}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <p>Start a conversation by typing a message below.</p>
          </div>
        )}
        {messages.map((message) => {
          const messageText = getMessageText(message);
          return (
            <div
              key={message.id}
              className={`${styles.message} ${
                message.role === 'user' ? styles.userMessage : styles.assistantMessage
              }`}
            >
              <div className={styles.messageRole}>
                {message.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className={styles.messageContent}>{messageText}</div>
            </div>
          );
        })}
        {isLoading && (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <div className={styles.messageRole}>Assistant</div>
            <div className={styles.messageContent}>Thinking...</div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className={styles.input}
          disabled={isLoading}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button type="submit" className={styles.submitButton} disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

