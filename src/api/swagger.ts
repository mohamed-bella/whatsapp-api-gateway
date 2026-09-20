export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'WhatsApp API Gateway',
    version: '1.0.0',
    description: 'Production Single-Account WhatsApp API Gateway built with Node.js, TypeScript, and Baileys.'
  },
  servers: [
    {
      url: '/',
      description: 'Current Gateway Server'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Provide your API Token as a Bearer token in the Authorization header.'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'WHATSAPP_NOT_CONNECTED' },
              message: { type: 'string', example: 'WhatsApp is currently not connected.' }
            }
          }
        }
      },
      SendTextRequest: {
        type: 'object',
        required: ['to', 'message'],
        properties: {
          to: { type: 'string', example: '212612345678', description: 'International phone number or with leading +' },
          message: { type: 'string', example: 'Hello, your quotation is ready.' }
        }
      },
      SendImageRequest: {
        type: 'object',
        required: ['to', 'url'],
        properties: {
          to: { type: 'string', example: '212612345678' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/image.jpg' },
          caption: { type: 'string', example: 'Your itinerary' }
        }
      },
      SendDocumentRequest: {
        type: 'object',
        required: ['to', 'url', 'filename'],
        properties: {
          to: { type: 'string', example: '212612345678' },
          url: { type: 'string', format: 'uri', example: 'https://example.com/quotation.pdf' },
          filename: { type: 'string', example: 'quotation.pdf' },
          caption: { type: 'string', example: 'Your quotation' },
          mimetype: { type: 'string', example: 'application/pdf' }
        }
      },
      SendResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          messageId: { type: 'string', example: 'BAE5F123456789' },
          to: { type: 'string', example: '212612345678' }
        }
      }
    }
  },
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        description: 'Returns the overall service health, uptime, and status of database and WhatsApp socket.',
        responses: {
          '200': {
            description: 'Health status OK'
          }
        }
      }
    },
    '/api/v1/status': {
      get: {
        summary: 'WhatsApp Gateway Status',
        description: 'Returns the current WhatsApp connection state and connected phone number.',
        responses: {
          '200': {
            description: 'Connection status'
          }
        }
      }
    },
    '/api/v1/send': {
      post: {
        summary: 'Send text message',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendTextRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Message sent successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendResponse' }
              }
            }
          },
          '400': { description: 'Invalid phone or message', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '503': { description: 'WhatsApp not connected', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
        }
      }
    },
    '/api/v1/send/image': {
      post: {
        summary: 'Send image message',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendImageRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Image sent successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendResponse' }
              }
            }
          }
        }
      }
    },
    '/api/v1/send/document': {
      post: {
        summary: 'Send document message',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendDocumentRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Document sent successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendResponse' }
              }
            }
          }
        }
      }
    }
  }
};
