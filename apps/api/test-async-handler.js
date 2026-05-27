import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/test', async (request, reply) => {
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' });
    reply.raw.write('Starting...\n');

    // Start async work in background
    (async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        reply.raw.write('Done\n');
        reply.raw.end();
    })().catch(err => {
        console.error('Pipeline error:', err);
    });

    // Handler returns immediately
});

app.listen({ port: 3003, host: '0.0.0.0' }).then(() => {
    console.log('Test server listening on port 3003');
}).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
