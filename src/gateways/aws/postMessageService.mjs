const postMessageService = (dependencies) => async ({ connectionId, message }) => {
    const { client, PostToConnectionCommand } = dependencies;
    const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: message,
    });

    await client.send(command);
    return true
}

export default postMessageService;
