import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBadGatewayResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import {
  ChatStatusDto,
  ConversationDetailDto,
  ConversationDto,
  ConversationsPageDto,
  ConversationsQueryDto,
  IdParamDto,
  SendMessageDto,
  SendMessageResultDto,
} from '../dto';
import { ChatRateLimitedException, ChatService } from './chat.service';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Whether the chat is available, has documents, and example questions',
  })
  @ZodResponse({ type: ChatStatusDto })
  status() {
    return this.chat.status();
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'List conversations, most recent activity first',
    description: 'Conversations without messages are not listed.',
  })
  @ApiBadRequestResponse({ description: 'Invalid query' })
  @ZodResponse({ type: ConversationsPageDto })
  list(@Query() query: ConversationsQueryDto) {
    return this.chat.listConversations(query);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Start a new, empty conversation' })
  @ZodResponse({ type: ConversationDto, status: 201 })
  create() {
    return this.chat.createConversation();
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'A conversation with its messages, oldest first' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ZodResponse({ type: ConversationDetailDto })
  get(@Param() { id }: IdParamDto) {
    return this.chat.getConversation(id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.chat.deleteConversation(id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary: 'Ask a question and get the answer',
    description:
      'Stores the question, answers from the analyzed documents and lists the documents used. ' +
      'If the answer fails the question is kept; sending the same text again reuses it.',
  })
  @ApiBadRequestResponse({ description: 'Empty or too long message' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limited; see the Retry-After header',
  })
  @ApiBadGatewayResponse({ description: 'The model failed or timed out' })
  @ApiServiceUnavailableResponse({ description: 'Chat is not configured' })
  @ZodResponse({ type: SendMessageResultDto, status: 201 })
  async send(
    @Param() { id }: IdParamDto,
    @Body() body: SendMessageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return await this.chat.sendMessage(id, body.content);
    } catch (error) {
      if (error instanceof ChatRateLimitedException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }
}
