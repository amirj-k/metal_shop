import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://upuqgnysdzqlxpfehqhp.supabase.co'
const supabaseKey = 'sb_publishable_6LUu00I0Jyqvufr7RC9Llg_asKqCMTF'

const supabaseClient = createClient(
    supabaseUrl,
    supabaseKey
)

const PRODUCT_BUCKET = 'product_image'
const LEGACY_PRODUCT_BUCKET = 'product-images'

function normalizeProductStoragePath(value) {
    const raw = String(value ?? '').trim()

    if (!raw) {
        return raw
    }

    return raw
        .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/product_image\//i, '')
        .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/product-images\//i, '')
        .replace(/^\/+/, '')
        .replace(/^product_image\//i, '')
        .replace(/^product-images\//i, '')
}

const originalStorageFrom = supabaseClient.storage.from.bind(supabaseClient.storage)

supabaseClient.storage.from = (bucketName) => {
    const normalizedBucket = bucketName === LEGACY_PRODUCT_BUCKET
        ? PRODUCT_BUCKET
        : bucketName

    const bucketClient = originalStorageFrom(normalizedBucket)

    if (normalizedBucket === PRODUCT_BUCKET) {
        const originalRemove = bucketClient.remove.bind(bucketClient)

        bucketClient.remove = (paths) => {
            const normalizedPaths = (Array.isArray(paths) ? paths : [paths])
                .map(normalizeProductStoragePath)

            return originalRemove(normalizedPaths)
        }
    }

    return bucketClient
}

export const supabase = supabaseClient
