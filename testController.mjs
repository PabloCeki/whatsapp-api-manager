import { startSessionController } from './src/controllers/index.mjs';

(async () => {
    const result = await startSessionController({
        authorizer: {
            uid: 'firebase_user_local_test'
        }
    });
    console.log(result);
})();