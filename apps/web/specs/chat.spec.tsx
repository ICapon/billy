import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  ChatMessage,
  ChatStatus,
  Conversation,
  SourceRef,
} from '@org/shared';
import { ChatSection } from '../src/app/components/chat/chat-section';
import * as api from '../src/app/lib/chat-api';
import { ApiError } from '../src/app/lib/files-api';

jest.mock('../src/app/lib/chat-api');
const mocked = api as jest.Mocked<typeof api>;

const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';

const status: ChatStatus = {
  enabled: true,
  hasDocuments: true,
  suggestions: ['¿Cuánto gasté en nómina el mes pasado?'],
};

const conversation = (id: string, title: string): Conversation => ({
  id,
  title,
  lastMessageAt: '2026-10-18T10:00:00.000Z',
  createdAt: '2026-10-18T10:00:00.000Z',
});

const message = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  sources: SourceRef[] = [],
): ChatMessage => ({
  id,
  role,
  content,
  sources,
  createdAt: '2026-10-18T10:00:00.000Z',
});

const source = (fileId: string, name: string, available = true): SourceRef => ({
  fileId,
  name,
  documentType: 'payroll',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  available,
});

const ask = (text: string) => {
  fireEvent.change(screen.getByLabelText('Tu pregunta'), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
};

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getChatStatus.mockResolvedValue(status);
  mocked.createConversation.mockResolvedValue(conversation('c1', ''));
  mocked.listConversations.mockResolvedValue({ items: [], nextCursor: null });
});

describe('ChatSection', () => {
  it('shows the upload guidance when there are no analyzed documents', async () => {
    mocked.getChatStatus.mockResolvedValue({
      ...status,
      hasDocuments: false,
    });
    render(<ChatSection />);
    const link = await screen.findByRole('link', { name: 'Sube documentos' });
    expect(link.getAttribute('href')).toBe('/files');
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('warns when the chat is not configured and blocks input', async () => {
    mocked.getChatStatus.mockResolvedValue({ ...status, enabled: false });
    render(<ChatSection />);
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.getByLabelText('Tu pregunta')).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('offers suggested questions on an empty conversation and sends one', async () => {
    mocked.sendMessage.mockResolvedValue({
      userMessage: message('m1', 'user', status.suggestions[0]),
      assistantMessage: message('m2', 'assistant', 'La nómina fue 1,000 USD.'),
    });
    render(<ChatSection />);
    fireEvent.click(await screen.findByText(status.suggestions[0]));
    expect(await screen.findByText('La nómina fue 1,000 USD.')).toBeTruthy();
    expect(mocked.createConversation).toHaveBeenCalledTimes(1);
    expect(mocked.sendMessage).toHaveBeenCalledWith(
      'c1',
      status.suggestions[0],
    );
    // suggestions disappear once the conversation has started
    expect(
      screen.queryByRole('button', { name: status.suggestions[0] }),
    ).toBeNull();
  });

  it('shows progress while the answer is prepared, then the answer', async () => {
    let resolve: (
      value: Awaited<ReturnType<typeof api.sendMessage>>,
    ) => void = () => undefined;
    mocked.sendMessage.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<ChatSection />);
    await screen.findByLabelText('Tu pregunta');
    ask('¿Saldo final?');
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText('¿Saldo final?')).toBeTruthy();
    resolve({
      userMessage: message('m1', 'user', '¿Saldo final?'),
      assistantMessage: message('m2', 'assistant', 'El saldo fue 500 USD.'),
    });
    expect(await screen.findByText('El saldo fue 500 USD.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not send empty or over-long messages', async () => {
    render(<ChatSection />);
    const send = await screen.findByRole('button', { name: 'Enviar' });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Tu pregunta'), {
      target: { value: '   ' },
    });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Tu pregunta'), {
      target: { value: 'x'.repeat(2001) },
    });
    expect(send).toHaveProperty('disabled', true);
    expect(screen.getByText(/demasiado largo/)).toBeTruthy();
    expect(mocked.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the question on failure and retries without creating another conversation', async () => {
    mocked.sendMessage
      .mockRejectedValueOnce(
        new ApiError('El asistente no pudo responder', 502),
      )
      .mockResolvedValueOnce({
        userMessage: message('m1', 'user', '¿Ventas?'),
        assistantMessage: message('m2', 'assistant', 'Ventas: 10.'),
      });
    render(<ChatSection />);
    await screen.findByLabelText('Tu pregunta');
    ask('¿Ventas?');
    expect(
      await screen.findByText('El asistente no pudo responder'),
    ).toBeTruthy();
    expect(screen.getByText('¿Ventas?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ventas: 10.')).toBeTruthy();
    expect(mocked.sendMessage).toHaveBeenNthCalledWith(1, 'c1', '¿Ventas?');
    expect(mocked.sendMessage).toHaveBeenNthCalledWith(2, 'c1', '¿Ventas?');
    expect(mocked.createConversation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists the source documents of an answer and links to the file detail', async () => {
    mocked.sendMessage.mockResolvedValue({
      userMessage: message('m1', 'user', '¿Nómina?'),
      assistantMessage: message('m2', 'assistant', 'Nómina: 1,000 USD.', [
        source(FILE_A, 'nomina-sep.pdf'),
        source(FILE_B, 'borrado.pdf', false),
      ]),
    });
    render(<ChatSection />);
    await screen.findByLabelText('Tu pregunta');
    ask('¿Nómina?');
    const link = await screen.findByRole('link', { name: /nomina-sep\.pdf/ });
    expect(link.getAttribute('href')).toBe(`/files/${FILE_A}`);
    expect(within(link).getByText(/Nómina/)).toBeTruthy(); // document type label
    // a deleted file is shown but not linked
    expect(screen.getByText('borrado.pdf')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /borrado\.pdf/ })).toBeNull();
  });

  it('starts a new conversation with an empty thread and a fresh server conversation', async () => {
    mocked.createConversation
      .mockResolvedValueOnce(conversation('c1', ''))
      .mockResolvedValueOnce(conversation('c2', ''));
    mocked.sendMessage.mockResolvedValue({
      userMessage: message('m1', 'user', 'Primera'),
      assistantMessage: message('m2', 'assistant', 'Respuesta uno'),
    });
    render(<ChatSection />);
    await screen.findByLabelText('Tu pregunta');
    ask('Primera');
    await screen.findByText('Respuesta uno');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
    expect(screen.queryByText('Respuesta uno')).toBeNull();
    expect(
      screen.getByRole('button', { name: status.suggestions[0] }),
    ).toBeTruthy();

    mocked.sendMessage.mockResolvedValue({
      userMessage: message('m3', 'user', 'Segunda'),
      assistantMessage: message('m4', 'assistant', 'Respuesta dos'),
    });
    ask('Segunda');
    await screen.findByText('Respuesta dos');
    expect(mocked.sendMessage).toHaveBeenLastCalledWith('c2', 'Segunda');
  });

  it('lists previous conversations, reopens one and deletes another', async () => {
    mocked.listConversations.mockResolvedValue({
      items: [
        conversation('c1', 'Nómina de septiembre'),
        conversation('c2', 'Ventas'),
      ],
      nextCursor: null,
    });
    mocked.getConversation.mockResolvedValue({
      conversation: conversation('c1', 'Nómina de septiembre'),
      messages: [
        message('m1', 'user', '¿Nómina de septiembre?'),
        message('m2', 'assistant', 'Fueron 1,000 USD.'),
      ],
    });
    mocked.deleteConversation.mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ChatSection />);
    await screen.findByLabelText('Tu pregunta');
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
    fireEvent.click(await screen.findByText('Nómina de septiembre'));
    expect(await screen.findByText('Fueron 1,000 USD.')).toBeTruthy();

    // continuing the reopened conversation reuses its id
    mocked.sendMessage.mockResolvedValue({
      userMessage: message('m3', 'user', 'y agosto?'),
      assistantMessage: message('m4', 'assistant', 'Agosto: 900 USD.'),
    });
    ask('y agosto?');
    await screen.findByText('Agosto: 900 USD.');
    expect(mocked.sendMessage).toHaveBeenCalledWith('c1', 'y agosto?');
    expect(mocked.createConversation).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar conversación: Ventas' }),
    );
    await waitFor(() =>
      expect(mocked.deleteConversation).toHaveBeenCalledWith('c2'),
    );
    await waitFor(() => expect(screen.queryByText('Ventas')).toBeNull());
    expect(screen.getByText('Agosto: 900 USD.')).toBeTruthy(); // open thread untouched
  });
});
