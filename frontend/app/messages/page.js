'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useLang } from '@/lib/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import './messages.css';

const MAX_MESSAGE_LENGTH = 2000;

const STUDENT_SELECT = `
  id,
  first_name,
  last_name,
  major,
  is_verified,
  university:universities(id, short_name, name)
`;

const CONNECTION_SELECT = `
  requester_id,
  addressee_id,
  status,
  created_at,
  requester:profiles!connections_requester_id_fkey(
    ${STUDENT_SELECT}
  ),
  addressee:profiles!connections_addressee_id_fkey(
    ${STUDENT_SELECT}
  )
`;

const MESSAGE_SELECT = `
  id,
  sender_id,
  recipient_id,
  content,
  created_at,
  read_at
`;

function normalizeRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStudent(student) {
  if (!student) return null;

  return {
    ...student,
    university: normalizeRelation(student.university),
  };
}

function normalizeConnection(connection) {
  return {
    ...connection,
    requester: normalizeStudent(connection.requester),
    addressee: normalizeStudent(connection.addressee),
  };
}

function getStudentName(student, fallback) {
  const firstName = student?.first_name?.trim() || '';
  const lastName = student?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim() || fallback;
}

function getInitials(student) {
  const first = student?.first_name?.trim()?.[0] || '';
  const last = student?.last_name?.trim()?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

function getUniversityName(student, fallback) {
  return student?.university?.short_name || student?.university?.name || fallback;
}

function localeFor(lang) {
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'en') return 'en-US';
  return 'kk-KZ';
}

function formatMessageTime(value, lang) {
  if (!value) return '';

  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  try {
    return new Intl.DateTimeFormat(localeFor(lang), sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return '';
  }
}

function formatFullTime(value, lang) {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function addMessage(rows, message, direction) {
  if (rows.some((row) => String(row.id) === String(message.id))) {
    return rows;
  }

  return [...rows, message].sort((a, b) => {
    const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return direction === 'desc' ? -delta : delta;
  });
}

function StudentAvatar({ student, size = 'medium' }) {
  return (
    <span className={`messages-avatar messages-avatar-${size}`} aria-hidden="true">
      {getInitials(student)}
    </span>
  );
}

export default function MessagesPage() {
  const { user, profile, loading } = useProfile();
  const { lang, t } = useLang();
  const [connections, setConnections] = useState([]);
  const [connectionMessages, setConnectionMessages] = useState([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceErrorKey, setWorkspaceErrorKey] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErrorKey, setChatErrorKey] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [composerErrorKey, setComposerErrorKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErrorKey, setSearchErrorKey] = useState('');
  const [activeConnectionKey, setActiveConnectionKey] = useState('');
  const [actionErrorKey, setActionErrorKey] = useState('');
  const [noticeKey, setNoticeKey] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const selectedStudentIdRef = useRef('');
  const messagesEndRef = useRef(null);

  const loadWorkspace = useCallback(async () => {
    if (!user?.id || !profile?.is_verified) {
      setWorkspaceLoading(false);
      return;
    }

    setWorkspaceLoading(true);
    setWorkspaceErrorKey('');

    const [connectionsResult, messagesResult] = await Promise.all([
      supabase
        .from('connections')
        .select(CONNECTION_SELECT)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (connectionsResult.error || messagesResult.error) {
      console.error('Messages workspace load error:', {
        connections: connectionsResult.error,
        messages: messagesResult.error,
      });
      setConnections([]);
      setConnectionMessages([]);
      setWorkspaceErrorKey('loadError');
    } else {
      setConnections((connectionsResult.data || []).map(normalizeConnection));
      setConnectionMessages(messagesResult.data || []);
    }

    setWorkspaceLoading(false);
  }, [profile?.is_verified, user?.id]);

  useEffect(() => {
    if (!loading && user && profile) {
      loadWorkspace();
    }
  }, [loading, user, profile, loadWorkspace]);

  const connectionByStudent = useMemo(() => {
    const map = new Map();

    connections.forEach((connection) => {
      const otherId = connection.requester_id === user?.id
        ? connection.addressee_id
        : connection.requester_id;
      map.set(otherId, connection);
    });

    return map;
  }, [connections, user?.id]);

  const conversationRows = useMemo(() => connections
    .filter((connection) => connection.status === 'accepted')
    .map((connection) => {
      const other = connection.requester_id === user?.id
        ? connection.addressee
        : connection.requester;
      const relatedMessages = connectionMessages.filter((message) => (
        (message.sender_id === user?.id && message.recipient_id === other?.id)
        || (message.sender_id === other?.id && message.recipient_id === user?.id)
      ));
      const latestMessage = relatedMessages[0] || null;
      const unreadCount = relatedMessages.filter((message) => (
        message.recipient_id === user?.id
        && message.sender_id === other?.id
        && !message.read_at
      )).length;

      return {
        connection,
        other,
        latestMessage,
        unreadCount,
      };
    })
    .filter((row) => row.other)
    .sort((a, b) => {
      const aTime = a.latestMessage?.created_at || a.connection.created_at;
      const bTime = b.latestMessage?.created_at || b.connection.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    }), [connections, connectionMessages, user?.id]);

  const incomingRequests = useMemo(() => connections.filter((connection) => (
    connection.status === 'pending'
    && connection.addressee_id === user?.id
    && connection.requester
  )), [connections, user?.id]);

  const selectedConversation = useMemo(() => conversationRows.find(
    (row) => row.other.id === selectedStudentId,
  ) || null, [conversationRows, selectedStudentId]);

  useEffect(() => {
    selectedStudentIdRef.current = selectedStudentId;
  }, [selectedStudentId]);

  useEffect(() => {
    if (
      selectedStudentId
      && !workspaceLoading
      && !conversationRows.some((row) => row.other.id === selectedStudentId)
    ) {
      setSelectedStudentId('');
    }
  }, [conversationRows, selectedStudentId, workspaceLoading]);

  const markConnectionRead = useCallback(async (otherStudentId) => {
    if (!user?.id || !otherStudentId) return;

    const { error } = await supabase.rpc('mark_connection_messages_read', {
      p_sender_id: otherStudentId,
    });

    if (error) {
      console.warn('Message read receipt update failed:', error);
      return;
    }

    const readAt = new Date().toISOString();
    const markRead = (message) => (
      message.sender_id === otherStudentId
      && message.recipient_id === user.id
      && !message.read_at
        ? { ...message, read_at: readAt }
        : message
    );

    setConnectionMessages((current) => current.map(markRead));
    setChatMessages((current) => current.map(markRead));
  }, [user?.id]);

  const loadChat = useCallback(async (otherStudentId) => {
    if (!user?.id || !otherStudentId) return;

    setChatLoading(true);
    setChatErrorKey('');
    setComposerErrorKey('');

    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherStudentId}),and(sender_id.eq.${otherStudentId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('Private conversation load error:', error);
      setChatMessages([]);
      setChatErrorKey('chatLoadError');
    } else {
      const rows = data || [];
      setChatMessages(rows);

      if (rows.some((message) => (
        message.sender_id === otherStudentId
        && message.recipient_id === user.id
        && !message.read_at
      ))) {
        await markConnectionRead(otherStudentId);
      }
    }

    setChatLoading(false);
  }, [markConnectionRead, user?.id]);

  useEffect(() => {
    if (selectedStudentId) {
      loadChat(selectedStudentId);
    } else {
      setChatMessages([]);
      setMessageText('');
      setChatErrorKey('');
    }
  }, [loadChat, selectedStudentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [chatMessages]);

  useEffect(() => {
    if (!user?.id || !profile?.is_verified) return undefined;

    setRealtimeState('connecting');
    const channel = supabase
      .channel(`private-messages-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const message = payload.new;
          setConnectionMessages((current) => addMessage(current, message, 'desc'));

          if (selectedStudentIdRef.current === message.sender_id) {
            setChatMessages((current) => addMessage(current, message, 'asc'));
            void markConnectionRead(message.sender_id);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeState('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [markConnectionRead, profile?.is_verified, user?.id]);

  useEffect(() => {
    const query = searchQuery.trim();
    setSearchErrorKey('');

    if (!profile?.is_verified || query.length < 2 || !user?.id) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      const pattern = `%${query.slice(0, 80).replace(/[%_]/g, '\\$&')}%`;

      const [firstNameResult, lastNameResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(STUDENT_SELECT)
          .eq('is_verified', true)
          .neq('id', user.id)
          .ilike('first_name', pattern)
          .order('first_name')
          .limit(20),
        supabase
          .from('profiles')
          .select(STUDENT_SELECT)
          .eq('is_verified', true)
          .neq('id', user.id)
          .ilike('last_name', pattern)
          .order('last_name')
          .limit(20),
      ]);

      if (!active) return;

      if (firstNameResult.error || lastNameResult.error) {
        console.error('Student discovery error:', {
          firstName: firstNameResult.error,
          lastName: lastNameResult.error,
        });
        setSearchResults([]);
        setSearchErrorKey('searchError');
      } else {
        const students = new Map();
        [...(firstNameResult.data || []), ...(lastNameResult.data || [])]
          .map(normalizeStudent)
          .forEach((student) => students.set(student.id, student));
        setSearchResults(Array.from(students.values()));
      }

      setSearchLoading(false);
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [profile?.is_verified, searchQuery, user?.id]);

  const handleSendRequest = async (student) => {
    if (!user?.id || !profile?.is_verified || student.id === user.id) return;

    const existingConnection = connectionByStudent.get(student.id);
    if (existingConnection?.status === 'accepted') {
      setSelectedStudentId(student.id);
      return;
    }
    if (existingConnection) return;

    const key = `${user.id}:${student.id}`;
    setActiveConnectionKey(key);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('connections')
      .insert({
        requester_id: user.id,
        addressee_id: student.id,
        status: 'pending',
      });

    if (error) {
      console.error('Connection request error:', error);
      setActionErrorKey(error.code === '23505' ? 'duplicateRequestError' : 'requestError');
    } else {
      setNoticeKey('requestSent');
      await loadWorkspace();
    }

    setActiveConnectionKey('');
  };

  const handleAcceptRequest = async (connection) => {
    const key = `${connection.requester_id}:${connection.addressee_id}`;
    setActiveConnectionKey(key);
    setActionErrorKey('');
    setNoticeKey('');

    const { data, error } = await supabase
      .from('connections')
      .update({ status: 'accepted' })
      .eq('requester_id', connection.requester_id)
      .eq('addressee_id', connection.addressee_id)
      .eq('status', 'pending')
      .select('requester_id, addressee_id, status')
      .maybeSingle();

    if (error || !data) {
      console.error('Connection accept error:', error);
      setActionErrorKey('acceptError');
    } else {
      setNoticeKey('requestAccepted');
      await loadWorkspace();
      setSelectedStudentId(connection.requester_id);
    }

    setActiveConnectionKey('');
  };

  const handleRejectRequest = async (connection) => {
    const key = `${connection.requester_id}:${connection.addressee_id}`;
    setActiveConnectionKey(key);
    setActionErrorKey('');
    setNoticeKey('');

    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('requester_id', connection.requester_id)
      .eq('addressee_id', connection.addressee_id)
      .eq('status', 'pending');

    if (error) {
      console.error('Connection reject error:', error);
      setActionErrorKey('rejectError');
    } else {
      setNoticeKey('requestRejected');
      await loadWorkspace();
    }

    setActiveConnectionKey('');
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    setComposerErrorKey('');

    const content = messageText.trim();
    if (!content) {
      setComposerErrorKey('emptyMessageError');
      return;
    }

    if (!user?.id || !selectedConversation?.other?.id) {
      setComposerErrorKey('connectionRequiredError');
      return;
    }

    setSending(true);
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        recipient_id: selectedConversation.other.id,
        content,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error) {
      console.error('Private message send error:', error);
      setComposerErrorKey('sendError');
    } else {
      setMessageText('');
      setChatMessages((current) => addMessage(current, data, 'asc'));
      setConnectionMessages((current) => addMessage(current, data, 'desc'));
    }

    setSending(false);
  };

  const renderStudentAction = (student) => {
    const connection = connectionByStudent.get(student.id);
    const key = connection
      ? `${connection.requester_id}:${connection.addressee_id}`
      : `${user?.id}:${student.id}`;
    const actionLoading = activeConnectionKey === key;

    if (connection?.status === 'accepted') {
      return (
        <button
          type="button"
          className="btn btn-secondary messages-student-action"
          onClick={() => setSelectedStudentId(student.id)}
        >
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" />
          {t('messages.openChat')}
        </button>
      );
    }

    if (connection?.status === 'pending' && connection.requester_id === user?.id) {
      return (
        <span className="messages-connection-state">
          <Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />
          {t('messages.outgoingPending')}
        </span>
      );
    }

    if (connection?.status === 'pending') {
      return (
        <span className="messages-connection-state">
          <UserRoundCheck size={16} strokeWidth={1.75} aria-hidden="true" />
          {t('messages.incomingPending')}
        </span>
      );
    }

    return (
      <button
        type="button"
        className="btn btn-secondary messages-student-action"
        onClick={() => handleSendRequest(student)}
        disabled={actionLoading}
      >
        {actionLoading ? (
          <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
        ) : (
          <UserRoundPlus size={18} strokeWidth={1.75} aria-hidden="true" />
        )}
        {t('messages.sendRequest')}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="messages-full-loading">
        <Loader2 size={22} strokeWidth={1.75} className="spin" aria-hidden="true" />
        <span>{t('messages.loading')}</span>
      </div>
    );
  }

  return (
    <AppShell profile={profile}>
      <div className={`messages-page ${selectedConversation ? 'chat-open' : ''}`}>
        <header className="messages-page-head">
          <div>
            <span className="chip messages-page-chip">
              <MessageCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              {t('messages.badge')}
            </span>
            <h1>{t('messages.title')}</h1>
            <p>{t('messages.subtitle')}</p>
          </div>
          {profile?.is_verified && (
            <button
              type="button"
              className="btn btn-ghost messages-refresh"
              onClick={loadWorkspace}
              disabled={workspaceLoading}
            >
              <RefreshCw
                size={18}
                strokeWidth={1.75}
                className={workspaceLoading ? 'spin' : ''}
                aria-hidden="true"
              />
              {t('messages.refresh')}
            </button>
          )}
        </header>

        {!profile && (
          <div className="alert alert-danger messages-page-alert">
            <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <strong>{t('messages.missingProfileTitle')}</strong>
              <p>{t('messages.missingProfileText')}</p>
            </div>
          </div>
        )}

        {profile && !profile.is_verified && (
          <section className="messages-verification-state">
            <span className="messages-major-icon">
              <ShieldCheck size={28} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <h2>{t('messages.verificationRequiredTitle')}</h2>
              <p>{t('messages.verificationRequiredText')}</p>
            </div>
            <Link href="/register" className="btn btn-red">
              {t('messages.continueVerification')}
            </Link>
          </section>
        )}

        {profile?.is_verified && (
          <>
            <section className="messages-discovery" aria-labelledby="student-search-title">
              <div className="messages-section-head">
                <div>
                  <h2 id="student-search-title">{t('messages.discoveryTitle')}</h2>
                  <p>{t('messages.discoverySubtitle')}</p>
                </div>
                <UserRoundPlus size={22} strokeWidth={1.75} aria-hidden="true" />
              </div>

              <label className="sr-only" htmlFor="student-search">
                {t('messages.searchLabel')}
              </label>
              <div className="messages-search-field">
                <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                <input
                  id="student-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('messages.searchPlaceholder')}
                  maxLength={80}
                  autoComplete="off"
                />
                {searchLoading && (
                  <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                )}
              </div>

              {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                <p className="messages-search-hint">{t('messages.searchHint')}</p>
              )}

              {searchErrorKey && (
                <div className="messages-inline-state error">
                  <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t(`messages.${searchErrorKey}`)}
                </div>
              )}

              {!searchLoading
                && searchQuery.trim().length >= 2
                && !searchErrorKey
                && searchResults.length === 0 && (
                <div className="messages-inline-state">
                  <UserRound size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t('messages.noStudentsFound')}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="messages-student-results">
                  {searchResults.map((student) => (
                    <article className="messages-student-row" key={student.id}>
                      <StudentAvatar student={student} />
                      <div className="messages-student-info">
                        <strong>{getStudentName(student, t('messages.studentFallback'))}</strong>
                        <span>
                          {getUniversityName(student, t('messages.universityFallback'))}
                          {student.major ? ` · ${student.major}` : ''}
                        </span>
                      </div>
                      {renderStudentAction(student)}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {(noticeKey || actionErrorKey) && (
              <div className={`messages-action-feedback ${actionErrorKey ? 'error' : 'success'}`}>
                {actionErrorKey ? (
                  <AlertCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Check size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                {t(`messages.${actionErrorKey || noticeKey}`)}
              </div>
            )}

            {incomingRequests.length > 0 && (
              <section className="messages-requests" aria-labelledby="incoming-requests-title">
                <div className="messages-section-head">
                  <div>
                    <h2 id="incoming-requests-title">{t('messages.incomingRequests')}</h2>
                    <p>
                      {t('messages.incomingRequestsCount')
                        .replace('{count}', String(incomingRequests.length))}
                    </p>
                  </div>
                  <UserRoundCheck size={22} strokeWidth={1.75} aria-hidden="true" />
                </div>

                <div className="messages-request-list">
                  {incomingRequests.map((connection) => {
                    const key = `${connection.requester_id}:${connection.addressee_id}`;
                    const actionLoading = activeConnectionKey === key;

                    return (
                      <article className="messages-request-row" key={key}>
                        <StudentAvatar student={connection.requester} />
                        <div className="messages-student-info">
                          <strong>
                            {getStudentName(connection.requester, t('messages.studentFallback'))}
                          </strong>
                          <span>
                            {getUniversityName(
                              connection.requester,
                              t('messages.universityFallback'),
                            )}
                            {connection.requester.major
                              ? ` · ${connection.requester.major}`
                              : ''}
                          </span>
                        </div>
                        <div className="messages-request-actions">
                          <button
                            type="button"
                            className="btn btn-red"
                            onClick={() => handleAcceptRequest(connection)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? (
                              <Loader2 size={17} strokeWidth={1.75} className="spin" aria-hidden="true" />
                            ) : (
                              <Check size={17} strokeWidth={1.75} aria-hidden="true" />
                            )}
                            {t('messages.accept')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet"
                            onClick={() => handleRejectRequest(connection)}
                            disabled={actionLoading}
                          >
                            <X size={17} strokeWidth={1.75} aria-hidden="true" />
                            {t('messages.reject')}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {realtimeState === 'error' && (
              <div className="messages-realtime-warning">
                <AlertCircle size={17} strokeWidth={1.75} aria-hidden="true" />
                {t('messages.realtimeUnavailable')}
              </div>
            )}

            <section className="messages-workspace" aria-label={t('messages.workspaceLabel')}>
              <aside className="messages-conversation-pane">
                <div className="messages-pane-heading">
                  <div>
                    <h2>{t('messages.conversationsTitle')}</h2>
                    <span>
                      {t('messages.connectionsCount')
                        .replace('{count}', String(conversationRows.length))}
                    </span>
                  </div>
                  <MessageCircle size={21} strokeWidth={1.75} aria-hidden="true" />
                </div>

                <div className="messages-conversation-list" aria-live="polite">
                  {workspaceLoading && (
                    <div className="messages-pane-state">
                      <Loader2 size={21} strokeWidth={1.75} className="spin" aria-hidden="true" />
                      {t('messages.loadingConversations')}
                    </div>
                  )}

                  {!workspaceLoading && workspaceErrorKey && (
                    <div className="messages-pane-state error">
                      <AlertCircle size={21} strokeWidth={1.75} aria-hidden="true" />
                      {t(`messages.${workspaceErrorKey}`)}
                    </div>
                  )}

                  {!workspaceLoading && !workspaceErrorKey && conversationRows.length === 0 && (
                    <div className="messages-pane-empty">
                      <UserRoundCheck size={25} strokeWidth={1.75} aria-hidden="true" />
                      <h3>{t('messages.noConnectionsTitle')}</h3>
                      <p>{t('messages.noConnectionsText')}</p>
                    </div>
                  )}

                  {!workspaceLoading && !workspaceErrorKey && conversationRows.map((row) => (
                    <button
                      type="button"
                      className={`messages-conversation-row ${selectedStudentId === row.other.id ? 'active' : ''}`}
                      key={row.other.id}
                      onClick={() => setSelectedStudentId(row.other.id)}
                    >
                      <StudentAvatar student={row.other} />
                      <span className="messages-conversation-copy">
                        <strong>{getStudentName(row.other, t('messages.studentFallback'))}</strong>
                        <span>
                          {row.latestMessage?.content || t('messages.noMessagesYet')}
                        </span>
                      </span>
                      <span className="messages-conversation-meta">
                        <time>{formatMessageTime(row.latestMessage?.created_at, lang)}</time>
                        {row.unreadCount > 0 && (
                          <span
                            className="messages-unread-count"
                            aria-label={t('messages.unreadCount')
                              .replace('{count}', String(row.unreadCount))}
                          >
                            {row.unreadCount}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="messages-chat-pane">
                {!selectedConversation && (
                  <div className="messages-chat-empty">
                    <span className="messages-major-icon">
                      <MessageCircle size={30} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <h2>{t('messages.selectChatTitle')}</h2>
                    <p>{t('messages.selectChatText')}</p>
                  </div>
                )}

                {selectedConversation && (
                  <>
                    <header className="messages-chat-head">
                      <button
                        type="button"
                        className="icon-btn messages-mobile-back"
                        onClick={() => setSelectedStudentId('')}
                        aria-label={t('messages.backToConversations')}
                        title={t('messages.backToConversations')}
                      >
                        <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <StudentAvatar student={selectedConversation.other} />
                      <div>
                        <strong>
                          {getStudentName(
                            selectedConversation.other,
                            t('messages.studentFallback'),
                          )}
                        </strong>
                        <span>
                          {getUniversityName(
                            selectedConversation.other,
                            t('messages.universityFallback'),
                          )}
                        </span>
                      </div>
                      <span className="status-indicator success messages-connected-state">
                        <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
                        {t('messages.connected')}
                      </span>
                    </header>

                    <div className="messages-thread" aria-live="polite">
                      {chatLoading && (
                        <div className="messages-thread-state">
                          <Loader2 size={21} strokeWidth={1.75} className="spin" aria-hidden="true" />
                          {t('messages.loadingChat')}
                        </div>
                      )}

                      {!chatLoading && chatErrorKey && (
                        <div className="messages-thread-state error">
                          <AlertCircle size={21} strokeWidth={1.75} aria-hidden="true" />
                          {t(`messages.${chatErrorKey}`)}
                        </div>
                      )}

                      {!chatLoading && !chatErrorKey && chatMessages.length === 0 && (
                        <div className="messages-thread-empty">
                          <MessageCircle size={24} strokeWidth={1.75} aria-hidden="true" />
                          <p>{t('messages.emptyChatText')}</p>
                        </div>
                      )}

                      {!chatLoading && !chatErrorKey && chatMessages.map((message) => {
                        const isMine = message.sender_id === user.id;

                        return (
                          <article
                            className={`messages-bubble ${isMine ? 'mine' : 'theirs'}`}
                            key={message.id}
                          >
                            <p>{message.content}</p>
                            <time dateTime={message.created_at}>
                              {formatFullTime(message.created_at, lang)}
                            </time>
                          </article>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    <form className="messages-composer" onSubmit={handleSendMessage}>
                      <label className="sr-only" htmlFor="private-message">
                        {t('messages.messageLabel')}
                      </label>
                      <textarea
                        id="private-message"
                        value={messageText}
                        onChange={(event) => {
                          setMessageText(event.target.value);
                          if (composerErrorKey) setComposerErrorKey('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder={t('messages.messagePlaceholder')}
                        maxLength={MAX_MESSAGE_LENGTH}
                        rows={2}
                        disabled={sending}
                      />
                      <div className="messages-composer-actions">
                        <span>
                          {messageText.length} / {MAX_MESSAGE_LENGTH}
                        </span>
                        <button type="submit" className="btn btn-red" disabled={sending}>
                          {sending ? (
                            <Loader2 size={18} strokeWidth={1.75} className="spin" aria-hidden="true" />
                          ) : (
                            <Send size={18} strokeWidth={1.75} aria-hidden="true" />
                          )}
                          {sending ? t('messages.sending') : t('messages.send')}
                        </button>
                      </div>
                      {composerErrorKey && (
                        <div className="messages-composer-error">
                          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
                          {t(`messages.${composerErrorKey}`)}
                        </div>
                      )}
                    </form>
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
