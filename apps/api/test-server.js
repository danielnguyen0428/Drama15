import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/test', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' });
    reply.raw.write('Hello\n');

    (async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        reply.raw.write('World\n');
        reply.raw.end();
    })().catch(err => {
        console.error('Pipeline error:', err);
    });

    return reply;
});

app.listen({ port: 3002, host: '0.0.0.0' }).then(() => {
    console.log('Test server listening on port 3002');
}).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
