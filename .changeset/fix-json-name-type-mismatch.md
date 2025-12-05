---
"@theplant/proto-to-ts": patch
---

### Bug Fix

- **Disabled json_name field replacement**: Fixed type definition mismatch with runtime objects.

### Problem

When a proto field uses `json_name` option:

```protobuf
string locale_code = 5 [json_name = "locale"];
```

The previous behavior would replace the TypeScript field name with `json_name`:

```typescript
// Generated type (WRONG)
locale: string;

// Runtime object (from @bufbuild/protobuf)
{
  localeCode: "Japan";
} // Uses camelCase of original field name
```

This caused a mismatch between TypeScript types and runtime objects.

### Solution

Disabled the `applyJsonNameMappings` function. Now generated types match runtime behavior:

```typescript
// Generated type (CORRECT)
localeCode: string;

// Runtime object
{
  localeCode: "Japan";
}
```

### Why This Works

`@bufbuild/protobuf` runtime uses camelCase of the original field name (`locale_code` → `localeCode`), NOT the `json_name`. The `json_name` is only used for JSON wire format serialization/deserialization, which the library handles automatically.

### Impact

- TypeScript types now match runtime objects
- No changes needed in consuming code
- JSON API communication still works correctly (library handles conversion)
