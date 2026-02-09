import {postWSApiMessageUsecase} from "./src/usecases/index.mjs";

(async () => {
    await postWSApiMessageUsecase({
      params:{
        connectionId: 'YgvzJeBXoAMCFfA=',
        message: JSON.stringify({
          type:'qr',
          text: ''
        }),
      }
    });
})();