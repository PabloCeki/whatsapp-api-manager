import { postWSApiMessageUsecase } from './src/usecases/index.mjs';

(async () => {
  await postWSApiMessageUsecase({
    params: {
      connectionId: 'Yhn12fM6IAMCFlw=',
      message: JSON.stringify({
        action: 'show_qr',
        data: {
          text:
            '2@gbw+YUgRqYkpzms7ttQLwEtDai4vuzpfoWYmEX3smEykWxvJGZkz/sfGbcUdzH/8FoyUz5GyrvOI2Pkcc8BQhQakEyBCBjbQel0=,0yu3kOxy0WjV8pQ8iennHWLKniX+MboAjc/WhLjRK1s=,NrPmPj2Ok3HJF7hwZ136lcqGSKV9QDWRHd2fH7ZMxiQ=,FXFK0G1SYIEyJVDU3BqBjWw1sjjLmpCu6ZgyfYnjl2Q=',
        },
      }),
    },
  });
})();
