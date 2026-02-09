import {getWsConnectionIdUsecase} from "./src/usecases/index.mjs";
(async () => {
    const result =  await getWsConnectionIdUsecase({
        params:{
            userId: '123452',
        }
    });
    console.log(result);
})();