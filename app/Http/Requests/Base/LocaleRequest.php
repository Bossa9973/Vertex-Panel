<?php

namespace Convoy\Http\Requests\Base;

use Illuminate\Foundation\Http\FormRequest;

class LocaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'locale' => ['nullable', 'string'],
            'namespace' => ['nullable', 'string'],
        ];
    }
}