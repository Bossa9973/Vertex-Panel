import http from '@/api/http'

/**
 * Requests a short-lived (5-minute) Google Drive download URL for a backup
 * that has been successfully uploaded to the cloud (cloudStatus === 'uploaded').
 *
 * The server generates the signed URL and returns only the URL — the Drive
 * path and bucket details are never exposed to the client.
 */
const downloadBackup = (
    serverUuid: string,
    backupUuid: string
): Promise<{ url: string }> => {
    return new Promise((resolve, reject) => {
        http.get(`/api/client/servers/${serverUuid}/backups/${backupUuid}/download`)
            .then(({ data }) => resolve(data))
            .catch(reject)
    })
}

export default downloadBackup

