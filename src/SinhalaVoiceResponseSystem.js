import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SignResponse from './SignResponse';

export const GEMINI_API_KEY = 'AIzaSyC-FN_icIcRzJvxOo0bsVSb5FRgUv_2fT0';
export const GEMINI_MODEL = 'gemini-1.5-flash-latest';
export const GCP_SPEECH_API_KEY = 'AIzaSyDjJEpJDySxZH5vZh-lrjLhPuxzI5nI_lk';

const COMMON_QUESTIONS = [
  'නම', 'ඔයාගේ නම', 'ඔබගේ නම', 'කවුද', 'මොකක්ද ඔබේ නම',
  'වයස', 'ඔබගේ වයස', 'ඔයාගේ වයස', 'ඔයාගේ ජන්මය කවද්ද',
  'ගම', 'ඔබගේ ගම', 'ඔයාගේ ගම', 'ඔබ ජීවත් වන්නේ කොහෙද',
  'ලිපිනය', 'ඔබගේ ලිපිනය', 'ඔයාගේ ලිපිනය'
];

const SinhalaVoiceResponseSystem = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [responseOptions, setResponseOptions] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const messagesEndRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const recognitionRef = useRef(null);

  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  
  // Vibration state and ref
  const [isVibrating, setIsVibrating] = useState(false);
  const vibrationIntervalRef = useRef(null);
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  const [userMemory, setUserMemory] = useState(() => {
    const savedMemory = localStorage.getItem('userMemory');
    return savedMemory ? JSON.parse(savedMemory) : {
      questions: {},
      answerCounts: {}
    };
  });

  const [editingResponseIndex, setEditingResponseIndex] = useState(null);
  const [editedResponse, setEditedResponse] = useState('');
  const [editingMemoryIndex, setEditingMemoryIndex] = useState(null);
  const [editedMemoryResponse, setEditedMemoryResponse] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editedMessageText, setEditedMessageText] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, responseOptions]);

  useEffect(() => {
    localStorage.setItem('userMemory', JSON.stringify(userMemory));
  }, [userMemory]);

  useEffect(() => {
    setSpeechSupported('speechSynthesis' in window);
    loadChatHistory();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
      stopVibration(); // Clean up vibration on unmount
    };
  }, []);

  // Vibration functions
  const startVibration = () => {
    if (!isMobile || !('vibrate' in navigator)) return;
    
    setIsVibrating(true);
    // Vibrate pattern: 200ms vibration, 100ms pause, repeat
    vibrationIntervalRef.current = setInterval(() => {
      navigator.vibrate(200);
    }, 300);
  };

  const stopVibration = () => {
    if (!isMobile || !('vibrate' in navigator)) return;
    
    clearInterval(vibrationIntervalRef.current);
    navigator.vibrate(0); // Stop any ongoing vibration
    setIsVibrating(false);
  };

  const loadChatHistory = () => {
    const savedChats = localStorage.getItem('sinhalaChatHistory');
    if (savedChats) {
      setChatHistory(JSON.parse(savedChats));
    }
  };

  const saveCurrentChat = () => {
    if (messages.length === 0) return;
    
    const chatTitle = messages[0].text.slice(0, 30) + (messages[0].text.length > 30 ? '...' : '');
    const newChat = {
      id: Date.now(),
      title: chatTitle,
      messages: [...messages],
      createdAt: new Date().toLocaleString()
    };

    const updatedHistory = [...chatHistory, newChat];
    setChatHistory(updatedHistory);
    localStorage.setItem('sinhalaChatHistory', JSON.stringify(updatedHistory));
    
    setMessages([]);
    setResponseOptions([]);
  };

  const loadChat = (chatId) => {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages);
      setShowHistory(false);
    }
  };

  const deleteChat = (chatId) => {
    const updatedHistory = chatHistory.filter(c => c.id !== chatId);
    setChatHistory(updatedHistory);
    localStorage.setItem('sinhalaChatHistory', JSON.stringify(updatedHistory));
  };

  const isSimilarQuestion = (newQuestion, rememberedQuestion) => {
    const similarityThreshold = 0.7;
    const newWords = newQuestion.toLowerCase().split(/\s+/);
    const rememberedWords = rememberedQuestion.toLowerCase().split(/\s+/);
    
    const commonWords = newWords.filter(word => rememberedWords.includes(word));
    const similarity = commonWords.length / Math.max(newWords.length, rememberedWords.length);
    
    return similarity >= similarityThreshold;
  };

  const isCommonQuestion = (question) => {
    return COMMON_QUESTIONS.some(commonQ => 
      question.toLowerCase().includes(commonQ.toLowerCase())
    );
  };

  const getRememberedResponse = (question) => {
    if (userMemory.questions && userMemory.questions[question]) {
      return {
        response: userMemory.questions[question],
        isRemembered: true
      };
    }
    
    for (const rememberedQuestion in userMemory.questions || {}) {
      if (isSimilarQuestion(question, rememberedQuestion)) {
        return {
          response: userMemory.questions[rememberedQuestion],
          isRemembered: true
        };
      }
    }
    
    return null;
  };

  const handleEditResponse = (index, response) => {
    setEditingResponseIndex(index);
    setEditedResponse(response);
  };

  const handleSaveEditedResponse = () => {
    if (!editedResponse.trim()) return;
    
    const updatedOptions = [...responseOptions];
    updatedOptions[editingResponseIndex] = editedResponse;
    setResponseOptions(updatedOptions);
    
    setEditingResponseIndex(null);
    setEditedResponse('');
  };

  const handleEditMemoryResponse = (question, response) => {
    setEditingMemoryIndex(question);
    setEditedMemoryResponse(response);
  };

  const handleSaveEditedMemoryResponse = () => {
    if (!editedMemoryResponse.trim()) return;
    
    setUserMemory(prev => ({
      ...prev,
      questions: {
        ...(prev.questions || {}),
        [editingMemoryIndex]: editedMemoryResponse
      },
      answerCounts: {
        ...(prev.answerCounts || {}),
        [editingMemoryIndex]: 3
      }
    }));
    
    setEditingMemoryIndex(null);
    setEditedMemoryResponse('');
  };

  const handleDeleteMemoryResponse = (question) => {
    if (window.confirm('ඔබට මෙම මතකය මකා දැමීමට අවශ්‍යද?')) {
      const updatedQuestions = { ...userMemory.questions };
      delete updatedQuestions[question];
      
      const updatedAnswerCounts = { ...userMemory.answerCounts };
      delete updatedAnswerCounts[question];
      
      setUserMemory(prev => ({
        ...prev,
        questions: updatedQuestions,
        answerCounts: updatedAnswerCounts
      }));
    }
  };

  const handleEditMessage = (messageId, text) => {
    setEditingMessageId(messageId);
    setEditedMessageText(text);
  };

  const handleSaveEditedMessage = () => {
    if (!editedMessageText.trim()) return;
    
    setMessages(prev => prev.map(msg => 
      msg.id === editingMessageId ? { ...msg, text: editedMessageText } : msg
    ));
    
    const messageToUpdate = messages.find(msg => msg.id === editingMessageId);
    if (messageToUpdate && messageToUpdate.sender === 'ai' && messageToUpdate.isRemembered) {
      const questionIndex = messages.findIndex(msg => msg.id < editingMessageId && msg.sender === 'user');
      if (questionIndex !== -1) {
        const question = messages[questionIndex].text;
        
        setUserMemory(prev => ({
          ...prev,
          questions: {
            ...(prev.questions || {}),
            [question]: editedMessageText
          },
          answerCounts: {
            ...(prev.answerCounts || {}),
            [question]: 3
          }
        }));
      }
    }
    
    setEditingMessageId(null);
    setEditedMessageText('');
  };

  const startRecording = () => {
    setSpeechError(null);
    setInputMessage('');
    
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('ඔබගේ බ්‍රව්සරය හඩ හඳුනාගැනීම සඳහා සහාය නොදක්වයි');
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'si-LK';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        setInputMessage(prev => prev + ' ' + transcript);
        setIsRecording(false);
        stopVibration(); // Stop vibration when speech is recognized
        handleSendMessage();
      };

      recognition.onerror = (event) => {
        setSpeechError(`හඩ හඳුනාගැනීමේ දෝෂය: ${event.error}`);
        setIsRecording(false);
        stopVibration(); // Stop vibration on error
      };

      recognition.onend = () => {
        setIsRecording(false);
        stopVibration(); // Stop vibration when recognition ends
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      
      // Start vibration when recording starts (for mobile)
      if (isMobile) {
        startVibration();
      }
    } catch (err) {
      setSpeechError(err.message);
      setIsRecording(false);
      stopVibration(); // Stop vibration on error
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      stopVibration(); // Stop vibration when recording stops manually
    }
  };

  const speakText = (text) => {
    if (!speechSupported) {
      alert('ඔබගේ බ්‍රව්සරය හඬ පිටකිරීම සඳහා සහාය නොදක්වයි');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'si-LK';

    const voices = window.speechSynthesis.getVoices();
    const sinhalaVoice = voices.find(voice => 
      voice.lang === 'si-LK' || voice.lang.startsWith('si-')
    );

    if (sinhalaVoice) {
      utterance.voice = sinhalaVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      // Start vibration when speech starts (for mobile)
      if (isMobile && !isRecording) {
        startVibration();
      }
    };
    
    utterance.onend = () => {
      setIsSpeaking(false);
      // Stop vibration when speech ends (for mobile)
      if (isMobile && !isRecording) {
        stopVibration();
      }
    };
    
    utterance.onerror = (event) => {
      console.error('Speech error:', event);
      setIsSpeaking(false);
      setSpeechError('හඬ පිටකිරීමේ දෝෂයක්: ' + event.error);
      // Stop vibration on error (for mobile)
      if (isMobile) {
        stopVibration();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    // Stop vibration when speaking stops (for mobile)
    if (isMobile) {
      stopVibration();
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) {
      setApiError('කරුණාකර පණිවිඩයක් ඇතුළත් කරන්න');
      return;
    }

    const userMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setApiError(null);
    setResponseOptions([]);
    stopSpeaking();

    try {
      const rememberedResponse = getRememberedResponse(inputMessage);
      
      if (rememberedResponse) {
        const aiMessage = {
          id: Date.now(),
          text: rememberedResponse.response,
          sender: 'ai',
          isSignResponse: true,
          isRemembered: rememberedResponse.isRemembered,
          timestamp: new Date().toLocaleTimeString()
        };
        
        setMessages(prev => [...prev, aiMessage]);
        speakText(rememberedResponse.response);
        return;
      }

      const isPersonalDetailQuestion = isCommonQuestion(inputMessage);
      
      if (isPersonalDetailQuestion && userMemory.name) {
        const response = `මගේ නම ${userMemory.name}`;
        const aiMessage = {
          id: Date.now(),
          text: response,
          sender: 'ai',
          isSignResponse: true,
          isRemembered: true,
          timestamp: new Date().toLocaleTimeString()
        };
        
        setMessages(prev => [...prev, aiMessage]);
        speakText(response);
        return;
      }

      const prompt = `
        Provide 3 concise responses in Sinhala (සිංහල) for the following message.
        Each response should be short (1-2 sentences max) and culturally appropriate for Sri Lanka.
        Return only the 3 responses separated by double newlines (\\n\\n).
        
        Message: ${inputMessage}
      `;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        }
      );

      const responseText = response.data.candidates[0].content.parts[0].text;
      
      const responses = responseText.split('\n\n')
        .map(r => r.trim())
        .filter(r => r.length > 0)
        .slice(0, 3);

      if (responses.length >= 3) {
        setResponseOptions(responses);
      } else {
        throw new Error('API did not return 3 complete responses');
      }
    } catch (err) {
      console.error('Error generating response:', err);
      setApiError('පිළිතුරු ජනනය කිරීමේදී දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectResponse = (response, isEdited = false) => {
    const aiMessage = {
      id: Date.now(),
      text: response,
      sender: 'ai',
      isSignResponse: true,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setMessages(prev => [...prev, aiMessage]);
    setResponseOptions([]);
    
    if (!isEdited) {
      speakText(response);
    }

    const userMessage = messages[messages.length - 1]?.text;
    
    if (userMessage) {
      const shouldRemember = isCommonQuestion(userMessage);
      
      const nameMatch = response.match(/මගේ නම (.+?) /) || 
                       response.match(/මම (.+?) /) ||
                       response.match(/මගේ නම (.+?)\./);
      
      if (nameMatch && nameMatch[1]) {
        setUserMemory(prev => ({
          ...prev,
          name: nameMatch[1],
          questions: {
            ...(prev.questions || {}),
            [userMessage]: response
          },
          answerCounts: {
            ...(prev.answerCounts || {}),
            [userMessage]: 3
          }
        }));
      } else {
        const currentCount = (userMemory.answerCounts && userMemory.answerCounts[userMessage]) || 0;
        const newCount = currentCount + 1;
        
        if (shouldRemember || newCount >= 3) {
          setUserMemory(prev => ({
            ...prev,
            questions: {
              ...(prev.questions || {}),
              [userMessage]: response
            },
            answerCounts: {
              ...(prev.answerCounts || {}),
              [userMessage]: newCount
            }
          }));
        } else {
          setUserMemory(prev => ({
            ...prev,
            answerCounts: {
              ...(prev.answerCounts || {}),
              [userMessage]: newCount
            }
          }));
        }
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearCurrentChat = () => {
    if (window.confirm('ඔබට මෙම සංවාදය මකා දැමීමට අවශ්‍යද?')) {
      setMessages([]);
      setResponseOptions([]);
    }
  };

  const clearMemory = () => {
    if (window.confirm('ඔබට මතකයේ ඇති සියලුම තොරතුරු මකා දැමීමට අවශ්‍යද?')) {
      setUserMemory({
        questions: {},
        answerCounts: {}
      });
    }
  };

  return (
    <div className="sinhala-chat-app">
      {/* Chat Header */}
      <div className="chat-header">
        <h1>SIGNIFY</h1>
        <div className="header-controls">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="history-button"
            title="සංවාද ඉතිහාසය"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12V15C3 16.6569 4.34315 18 6 18H8L12 22V2L8 6H6C4.34315 6 3 7.34315 3 9V12Z" fill="currentColor"/>
              <path d="M16.5 12C16.5 10.067 15.037 8.5 13 8.5M19 12C19 8.13401 15.866 5 12 5M15.5 12C15.5 13.933 16.963 15.5 19 15.5M21 12C21 15.866 17.866 19 14 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {window.innerWidth > 768 && 'ඉතිහාසය'}
          </button>
          {messages.length > 0 && (
            <>
              <button 
                onClick={saveCurrentChat}
                className="save-chat-button"
                title="සංවාදය සුරකින්න"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 3H16.1716L19 5.82843V19C19 20.1046 18.1046 21 17 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 3V9H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {window.innerWidth > 768 && 'සුරකින්න'}
              </button>
              <button 
                onClick={clearCurrentChat}
                className="clear-chat-button"
                title="සංවාදය මකන්න"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {window.innerWidth > 768 && 'මකන්න'}
              </button>
            </>
          )}
          <button 
            onClick={() => setShowMemory(!showMemory)}
            className={`memory-button ${showMemory ? 'active' : ''}`}
            title="මතකය පරිපාලනය"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12H15M9 16H15M10 5H14C14.5523 5 15 4.55228 15 4V3.5C15 3.22386 14.7761 3 9.5 3C9.22386 3 9 3.22386 9 3.5V4C9 4.55228 9.44772 5 10 5ZM7 21H17C18.1046 21 19 20.1046 19 19V9C19 7.89543 18.1046 7 17 7H7C5.89543 7 5 7.89543 5 9V19C5 20.1046 5.89543 21 7 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {window.innerWidth > 768 && 'මතකය'}
          </button>
        </div>
      </div>
      
      {/* Chat History Panel */}
      {showHistory && (
        <div className="history-panel">
          <div className="panel-header">
            <button 
              onClick={() => setShowHistory(false)}
              className="back-button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              ආපසු
            </button>
            <h3>සංවාද ඉතිහාසය</h3>
          </div>
          
          {chatHistory.length === 0 ? (
            <div className="empty-state">
              සුරකින ලද සංවාද නොමැත
            </div>
          ) : (
            <div className="history-list">
              {chatHistory.map((chat) => (
                <div 
                  key={chat.id}
                  className="history-item"
                  onClick={() => loadChat(chat.id)}
                >
                  <div className="history-item-title">
                    {chat.title}
                  </div>
                  <div className="history-item-date">
                    {chat.createdAt}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="delete-history-item"
                    title="මකන්න"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
  
      {/* Memory Panel */}
      {showMemory && (
        <div className="memory-panel">
          <div className="panel-header">
            <button 
              onClick={() => setShowMemory(false)}
              className="back-button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              ආපසු
            </button>
            <h3>මතකය පරිපාලනය</h3>
          </div>
          
          {userMemory.name && (
            <div className="memory-name-section">
              <h4>මගේ නම:</h4>
              <div className="memory-item">
                <span>{userMemory.name}</span>
                <button 
                  onClick={() => {
                    if (window.confirm('ඔබට මෙම නම මකා දැමීමට අවශ්‍යද?')) {
                      setUserMemory(prev => {
                        const newMemory = { ...prev };
                        delete newMemory.name;
                        return newMemory;
                      });
                    }
                  }}
                  className="delete-memory-item"
                  title="මකන්න"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          <h4>මතකගත ප්‍රශ්න සහ පිළිතුරු:</h4>
          
          {(!userMemory.questions || Object.keys(userMemory.questions).length === 0) ? (
            <div className="empty-state">
              මතකගත ප්‍රශ්න සහ පිළිතුරු නොමැත
            </div>
          ) : (
            <div className="memory-list">
              {Object.entries(userMemory.questions || {}).map(([question, response]) => (
                <div key={question} className="memory-item-container">
                  {editingMemoryIndex === question ? (
                    <div className="memory-edit-form">
                      <div className="memory-edit-question">ප්‍රශ්නය: {question}</div>
                      <textarea
                        value={editedMemoryResponse}
                        onChange={(e) => setEditedMemoryResponse(e.target.value)}
                        className="memory-edit-textarea"
                      />
                      <div className="memory-edit-buttons">
                        <button
                          onClick={() => {
                            setEditingMemoryIndex(null);
                            setEditedMemoryResponse('');
                          }}
                          className="cancel-edit-button"
                        >
                          අවලංගු
                        </button>
                        <button
                          onClick={handleSaveEditedMemoryResponse}
                          className="save-edit-button"
                        >
                          සුරකින්න
                        </button>
                      </div>
                    </div>
                  ) : (
                    <React.Fragment>
                      <div className="memory-item-question">ප්‍රශ්නය: {question}</div>
                      <div className="memory-item-response">පිළිතුර: {response}</div>
                      <div className="memory-item-count">
                        තෝරාගත් ගණන: {userMemory.answerCounts?.[question] || 0}
                      </div>
                      <div className="memory-item-actions">
                        <button
                          onClick={() => handleEditMemoryResponse(question, response)}
                          className="edit-memory-button"
                          title="සංස්කරණය"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13M18.4142 3.58579C18.7893 3.21071 19.298 3 19.8284 3C20.3588 3 20.8675 3.21071 21.2426 3.58579C21.6177 3.96086 21.8284 4.46957 21.8284 5C21.8284 5.53043 21.6177 6.03914 21.2426 6.41421L12.7071 14.9497L9 15.8284L9.87868 12.1213L18.4142 3.58579Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteMemoryResponse(question)}
                          className="delete-memory-button"
                          title="මකන්න"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </React.Fragment>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div className="memory-clear-section">
            <button 
              onClick={clearMemory}
              className="clear-memory-button"
            >
              සියලු මතකය මකන්න
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="chat-messages-container">
        {messages.length === 0 && !showHistory && !showMemory ? (
          <div className="empty-chat-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 10H8.01M12 10H12.01M16 10H16.01M8 14H8.01M12 14H12.01M16 14H16.01M8 18H8.01M12 18H12.01M16 18H16.01M3 20L4.3 16.7C4.3 16.7 4.3 16.7 4.3 16.7C4.47712 16.2582 4.47712 15.7418 4.3 15.3C4.3 15.3 4.3 15.3 4.3 15.3L7.6 12C7.6 12 7.6 12 7.6 12C8.04177 11.8229 8.55823 11.8229 9 12C9 12 9 12 9 12L12.3 15.3C12.3 15.3 12.3 15.3 12.3 15.3C12.4771 15.7418 12.4771 16.2582 12.3 16.7C12.3 16.7 12.3 16.7 12.3 16.7L13.6 20C13.6 20 13.6 20 13.6 20C13.7771 20.4418 13.7771 20.9582 13.6 21.4C13.6 21.4 13.6 21.4 13.6 21.4L10.3 24.7C10.3 24.7 10.3 24.7 10.3 24.7C9.85823 24.8771 9.34177 24.8771 8.9 24.7C8.9 24.7 8.9 24.7 8.9 24.7L5.6 21.4C5.6 21.4 5.6 21.4 5.6 21.4C5.15823 21.2229 5.15823 20.7065 5.6 20.3C5.6 20.3 5.6 20.3 5.6 20.3L8.9 17C8.9 17 8.9 17 8.9 17C9.34177 16.8229 9.85823 16.8229 10.3 17C10.3 17 10.3 17 10.3 17L13.6 20.3M21 4L19.7 7.3C19.7 7.3 19.7 7.3 19.7 7.3C19.5229 7.74177 19.5229 8.25823 19.7 8.7C19.7 8.7 19.7 8.7 19.7 8.7L16.4 12C16.4 12 16.4 12 16.4 12C15.9582 12.1771 15.4418 12.1771 15 12C15 12 15 12 15 12L11.7 8.7C11.7 8.7 11.7 8.7 11.7 8.7C11.5229 8.25823 11.5229 7.74177 11.7 7.3C11.7 7.3 11.7 7.3 11.7 7.3L10.4 4C10.4 4 10.4 4 10.4 4C10.2229 3.55823 10.2229 3.04177 10.4 2.6C10.4 2.6 10.4 2.6 10.4 2.6L13.7 -0.7C13.7 -0.7 13.7 -0.7 13.7 -0.7C14.1418 -0.877096 14.6582 -0.877096 15.1 -0.7C15.1 -0.7 15.1 -0.7 15.1 -0.7L18.4 2.6C18.4 2.6 18.4 2.6 18.4 2.6C18.8418 2.7771 18.8418 3.29356 18.4 3.7C18.4 3.7 18.4 3.7 18.4 3.7L15.1 7C15.1 7 15.1 7 15.1 7C14.6582 7.1771 14.1418 7.1771 13.7 7C13.7 7 13.7 7 13.7 7L10.4 3.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="empty-chat-title">ඔබගේ සංවාදය ආරම්භ කරන්න</p>
            <p className="empty-chat-subtitle">
              {window.innerWidth <= 768 ? 
                "කතා කිරීම ආරම්භ කරන්න" : 
                "හඩින් පණිවිඩයක් යැවීමට මයික්‍රොෆෝන බොත්තම ඔබන්න"}
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div 
                key={message.id}
                className={`message-container ${message.sender}`}
              >
                {editingMessageId === message.id ? (
                  <div className="message-edit-form">
                    <textarea
                      value={editedMessageText}
                      onChange={(e) => setEditedMessageText(e.target.value)}
                      className="message-edit-textarea"
                    />
                    <div className="message-edit-buttons">
                      <button
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditedMessageText('');
                        }}
                        className="cancel-edit-button"
                      >
                        අවලංගු
                      </button>
                      <button
                        onClick={handleSaveEditedMessage}
                        className="save-edit-button"
                      >
                        සුරකින්න
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className={`message-bubble ${message.sender}`}
                  >
                    {message.sender === 'ai' && message.isSignResponse ? (
                      <SignResponse text={message.text} />
                    ) : (
                      message.text
                    )}
                    <div className="message-meta">
                      {message.timestamp}
                      {message.sender === 'ai' && speechSupported && (
                        <button 
                          onClick={() => speakText(message.text)}
                          className="speak-button"
                          title="කියවන්න"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 12V15C3 16.6569 4.34315 18 6 18H8L12 22V2L8 6H6C4.34315 6 3 7.34315 3 9V12Z" fill="#4285F4"/>
                            <path d="M16.5 12C16.5 10.067 15.037 8.5 13 8.5M19 12C19 8.13401 15.866 5 12 5M15.5 12C15.5 13.933 16.963 15.5 19 15.5M21 12C21 15.866 17.866 19 14 19" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                      {message.sender === 'ai' && message.isRemembered && (
                        <button 
                          onClick={() => handleEditMessage(message.id, message.text)}
                          className="edit-message-button"
                          title="පිළිතුර සංස්කරණය කරන්න"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13M18.4142 3.58579C18.7893 3.21071 19.298 3 19.8284 3C20.3588 3 20.8675 3.21071 21.2426 3.58579C21.6177 3.96086 21.8284 4.46957 21.8284 5C21.8284 5.53043 21.6177 6.03914 21.2426 6.41421L12.7071 14.9497L9 15.8284L9.87868 12.1213L18.4142 3.58579Z" stroke="#5f6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Response Options with Edit Functionality */}
            {responseOptions.length > 0 && (
              <div className="response-options-container">
                <div className="response-options-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8V12L15 15M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  ඔබට තෝරාගත හැකි පිළිතුරු:
                </div>
                <div className="response-options-list">
                  {responseOptions.map((option, index) => (
                    <div key={index} className="response-option-container">
                      {editingResponseIndex === index ? (
                        <div className="response-edit-form">
                          <textarea
                            value={editedResponse}
                            onChange={(e) => setEditedResponse(e.target.value)}
                            className="response-edit-textarea"
                          />
                          <div className="response-edit-buttons">
                            <button
                              onClick={() => {
                                setEditingResponseIndex(null);
                                setEditedResponse('');
                              }}
                              className="cancel-edit-button"
                            >
                              අවලංගු
                            </button>
                            <button
                              onClick={() => {
                                handleSaveEditedResponse();
                                handleSelectResponse(editedResponse, true);
                                speakText(editedResponse);
                              }}
                              className="save-edit-button"
                            >
                              අවසන් කර කියවන්න
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="response-option-content">
                          <button
                            onClick={() => handleSelectResponse(option)}
                            className="response-option-button"
                          >
                            <SignResponse text={option} />
                          </button>
                          <button
                            onClick={() => handleEditResponse(index, option)}
                            className="edit-response-button"
                            title="පිළිතුර සංස්කරණය කරන්න"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13M18.4142 3.58579C18.7893 3.21071 19.298 3 19.8284 3C20.3588 3 20.8675 3.21071 21.2426 3.58579C21.6177 3.96086 21.8284 4.46957 21.8284 5C21.8284 5.53043 21.6177 6.03914 21.2426 6.41421L12.7071 14.9497L9 15.8284L9.87868 12.1213L18.4142 3.58579Z" stroke="#5f6368" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {isLoading && (
              <div className="loading-indicator">
                <div className="loading-dots">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* Input Area */}
      <div className="input-area">
        {apiError && (
          <div className="error-message api-error">
            {apiError}
          </div>
        )}
        
        {speechError && (
          <div className="error-message speech-error">
            {speechError}
          </div>
        )}
        
        <div className="input-container">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="පණිවිඩයක් ඇතුළත් කරන්න..."
            className="message-input"
          />
          
          <div className="input-buttons">
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`record-button ${isRecording ? 'recording' : 'idle'}`}
              title={isRecording ? 'පටිගත කිරීම නවත්තන්න' : 'හඩින් පණිවිඩයක් යවන්න'}
            >
              {isRecording && (
                <div className="recording-indicator"></div>
              )}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {isRecording ? (
                  <rect x="6" y="5" width="12" height="16" rx="1" fill="currentColor"/>
                ) : (
                  <path d="M3 12V15C3 16.6569 4.34315 18 6 18H8L12 22V2L8 6H6C4.34315 6 3 7.34315 3 9V12Z" fill="currentColor"/>
                )}
                {!isRecording && (
                  <path d="M16.5 12C16.5 10.067 15.037 8.5 13 8.5M19 12C19 8.13401 15.866 5 12 5M15.5 12C15.5 13.933 16.963 15.5 19 15.5M21 12C21 15.866 17.866 19 14 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                )}
              </svg>
            </button>
            
            <button 
              onClick={handleSendMessage}
              disabled={!inputMessage.trim()}
              className={`send-button ${!inputMessage.trim() ? 'disabled' : ''}`}
              title="යවන්න"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .sinhala-chat-app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          max-width: 100%;
          margin: 0 auto;
          background-color: #f5f5f5;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .chat-header {
          background-color: #4285f4;
          color: white;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .chat-header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        
        .header-controls {
          display: flex;
          gap: 8px;
        }
        
        .header-controls button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background 0.2s;
        }
        
        .header-controls button:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .header-controls button svg {
          flex-shrink: 0;
        }
        
        .history-panel, .memory-panel {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: white;
          z-index: 100;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .panel-header {
          background-color: #4285f4;
          color: white;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .panel-header h3 {
          margin: 0;
          flex-grow: 1;
        }
        
        .back-button {
          background: none;
          border: none;
          color: white;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 1rem;
        }
        
        .history-list, .memory-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        
        .history-item {
          background: white;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          position: relative;
          cursor: pointer;
        }
        
        .history-item:hover {
          background: #f0f0f0;
        }
        
        .history-item-title {
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .history-item-date {
          font-size: 0.8rem;
          color: #666;
        }
        
        .delete-history-item {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          text-align: center;
          padding: 20px;
        }
        
        .memory-item-container {
          background: white;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .memory-item-question {
          font-weight: 500;
          color: #333;
          margin-bottom: 4px;
        }
        
        .memory-item-response {
          color: #555;
          margin-bottom: 4px;
        }
        
        .memory-item-count {
          font-size: 0.8rem;
          color: #777;
          margin-bottom: 8px;
        }
        
        .memory-item-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        
        .edit-memory-button, .delete-memory-button {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
        }
        
        .memory-edit-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .memory-edit-textarea {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          min-height: 80px;
          resize: vertical;
        }
        
        .memory-edit-buttons {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        
        .cancel-edit-button, .save-edit-button {
          padding: 6px 12px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
        }
        
        .cancel-edit-button {
          background: #f0f0f0;
          color: #333;
        }
        
        .save-edit-button {
          background: #4285f4;
          color: white;
        }
        
        .memory-clear-section {
          padding: 16px;
          display: flex;
          justify-content: center;
        }
        
        .clear-memory-button {
          background: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background-color: #f5f5f5;
        }
        
        .empty-chat-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          text-align: center;
          padding: 20px;
        }
        
        .empty-chat-title {
          font-size: 1.2rem;
          margin: 16px 0 8px;
        }
        
        .empty-chat-subtitle {
          font-size: 0.9rem;
          max-width: 300px;
        }
        
        .message-container {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
        }
        
        .message-container.user {
          align-items: flex-end;
        }
        
        .message-container.ai {
          align-items: flex-start;
        }
        
        .message-bubble {
          max-width: 80%;
          padding: 10px 16px;
          border-radius: 18px;
          position: relative;
          word-wrap: break-word;
        }
        
        .message-bubble.user {
          background-color: #4285f4;
          color: white;
          border-bottom-right-radius: 4px;
        }
        
        .message-bubble.ai {
          background-color: white;
          color: #333;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .message-meta {
          display: flex;
          align-items: center;
          font-size: 0.75rem;
          margin-top: 4px;
          color: #666;
        }
        
        .message-bubble.user .message-meta {
          justify-content: flex-end;
          color: rgba(255,255,255,0.7);
        }
        
        .speak-button, .edit-message-button {
          background: none;
          border: none;
          margin-left: 8px;
          cursor: pointer;
          color: inherit;
          opacity: 0.7;
        }
        
        .speak-button:hover, .edit-message-button:hover {
          opacity: 1;
        }
        
        .message-edit-form {
          width: 100%;
          max-width: 80%;
        }
        
        .message-edit-textarea {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          min-height: 60px;
          resize: vertical;
        }
        
        .message-edit-buttons {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          justify-content: flex-end;
        }
        
        .response-options-container {
          background: white;
          border-radius: 12px;
          padding: 12px;
          margin-top: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .response-options-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 12px;
        }
        
        .response-options-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .response-option-container {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .response-option-content {
          display: flex;
        }
        
        .response-option-button {
          flex: 1;
          background: none;
          border: none;
          text-align: left;
          padding: 10px;
          cursor: pointer;
        }
        
        .response-option-button:hover {
          background: #f5f5f5;
        }
        
        .edit-response-button {
          background: none;
          border: none;
          border-left: 1px solid #e0e0e0;
          padding: 0 12px;
          cursor: pointer;
          color: #666;
        }
        
        .response-edit-form {
          padding: 12px;
        }
        
        .response-edit-textarea {
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px;
          min-height: 80px;
          resize: vertical;
        }
        
        .response-edit-buttons {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          justify-content: flex-end;
        }
        
        .loading-indicator {
          display: flex;
          justify-content: center;
          padding: 16px;
        }
        
        .loading-dots {
          display: flex;
          gap: 8px;
        }
        
        .loading-dot {
          width: 10px;
          height: 10px;
          background-color: #4285f4;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        
        .loading-dot:nth-child(1) {
          animation-delay: -0.32s;
        }
        
        .loading-dot:nth-child(2) {
          animation-delay: -0.16s;
        }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
        
        .input-area {
          padding: 12px 16px;
          background: white;
          border-top: 1px solid #e0e0e0;
        }
        
        .error-message {
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 8px;
          font-size: 0.9rem;
        }
        
        .api-error {
          background-color: #ffebee;
          color: #c62828;
        }
        
        .speech-error {
          background-color: #fff8e1;
          color: #e65100;
        }
        
        .input-container {
          display: flex;
          gap: 8px;
        }
        
        .message-input {
          flex: 1;
          border: 1px solid #e0e0e0;
          border-radius: 20px;
          padding: 10px 16px;
          resize: none;
          min-height: 40px;
          max-height: 120px;
        }
        
        .input-buttons {
          display: flex;
          gap: 8px;
        }
        
        .record-button, .send-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        
        .record-button {
          background-color: #f5f5f5;
          color: #333;
          position: relative;
        }
        
        .record-button.recording {
          background-color: #f44336;
          color: white;
        }
        
        .recording-indicator {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 12px;
          height: 12px;
          background-color: #f44336;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
        
        .record-button.recording .recording-indicator {
          background-color: white;
        }
        
        .send-button {
          background-color: #4285f4;
          color: white;
        }
        
        .send-button.disabled {
          background-color: #e0e0e0;
          cursor: not-allowed;
        }
        
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        
        /* Sign response styles */
        .sign-response-container {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          line-height: 1.5;
        }
        
        .sign-token-container {
          display: inline-flex;
          align-items: center;
          margin: 2px;
        }
        
        .sign-image-container {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .sign-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          background-color: #f8f9fa;
          transition: transform 0.2s ease;
        }
        
        .sign-image:hover {
          transform: scale(1.05);
        }
        
        .sign-word-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 12px;
          margin-top: 4px;
        }
        
        .sinhala-word {
          font-weight: 500;
        }
        
        .translation {
          font-size: 10px;
          color: #666;
          font-style: italic;
        }
        
        .whitespace {
          white-space: pre;
        }
        
        .punctuation {
          margin-left: 2px;
        }
        
        /* Mobile specific styles */
        @media (max-width: 768px) {
          .chat-header h1 {
            font-size: 1.2rem;
          }
          
          .header-controls button span {
            display: none;
          }
          
          .header-controls button {
            padding: 6px;
          }
          
          .message-bubble {
            max-width: 90%;
          }
        }
      `}</style>
    </div>
  );
};

export default SinhalaVoiceResponseSystem;