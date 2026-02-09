import { sendMessageController } from './src/controllers/index.mjs';

(async () => {
    const result = await sendMessageController({
        authorizer: {
            uid: 'firebase_user_local_test'
        },
        sqsBodyParams: {
            body: {
                target: '5493865596760',
                message: 'Hello World 2'
            }
        }
    });
    console.log(result);
})();
