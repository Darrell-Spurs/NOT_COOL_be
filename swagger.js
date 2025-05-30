// swagger.js
import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'NOT_COOL API',
    version: '1.0.0',
    description: 'API documentation for the NOT_COOL backend',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local dev server',
    },
  ],
};

const options = {
  swaggerDefinition,
  // Path(s) to your route files with JSDoc comments
  apis: ['./index.js'], // adjust path if needed
};

export const swaggerSpec = swaggerJSDoc(options);
