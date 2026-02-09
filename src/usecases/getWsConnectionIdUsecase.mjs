const getWsConnectionIdUsecase = (dependencies) => async ({ params }) => {
  const { model } = dependencies;
  const { userId } = params;
  const result = await model.queryTable({
    IndexName: 'UserIndex',
    KeyConditionExpression: 'userId = :id',
    ExpressionAttributeValues: { ':id': userId },
  });
  return result?.items?.[0]?.connectionId;
};

export default getWsConnectionIdUsecase;
