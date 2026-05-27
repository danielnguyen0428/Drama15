import Fastify from 'fastify';

const app = Fastify({ logger: { level: 'info' } });

app.get('/voices', async (_request, reply) => {
    return reply.send({ voices: [{ id: 'default', name: 'Test' }] });
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';

app.listen({ port: PORT, host: HOST }).then((address) => {
    console.log(`Minimal server listening at ${address}`);
}).catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
});
