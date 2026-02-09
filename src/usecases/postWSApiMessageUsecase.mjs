const postWSApiMessageUsecase = (dependencies) => ({ params }) => {
  const { postMessageService } = dependencies;
  const { connectionId, message } = params;
  return postMessageService({ connectionId, message });
};

export default postWSApiMessageUsecase;
