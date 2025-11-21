export type User = {
    id: number,
    first_name?: string,
    last_name?: string,
    email: string,
    facility_id?: number,
    token?: string
};

export type Form = {
    id: number | string,
    title: string,
    form_definition: any
};

export type Entry = {
    id: string,
    formId: string | number,
    activityId?: string | number,
    answers: any,
    status: 'pending' | 'synced'
};
