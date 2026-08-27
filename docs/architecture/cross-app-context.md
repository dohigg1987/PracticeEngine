# Cross-application context

Tenant identity is React shell state and is not reset by `navigate`, application launcher selection or browser history. User identity and global notification state likewise remain in the global shell.

The canonical client remains `organisation.id`/the Platform client compatibility anchor. Applications receive that stable client ID; no application-specific client record is created for navigation.

| Source | Action | Preconditions | Context carried |
| --- | --- | --- | --- |
| Practice work detail | Open in Ledgerly | `ledgerly.enabled`; work declares `specialist_module_key=ledgerly`; linked specialist record exists | canonical client ID and existing Ledgerly engagement reference |
| Practice CRM opportunity | Open in QuoteBench | `quotebench.enabled`; user can view the opportunity | stable opportunity ID; QuoteBench resolves bounded shared context through its integration boundary |

Context is carried as encoded route parameters for selection only. It does not grant access. The target application/API revalidates tenant membership, permission, entitlement and record relationship. A missing Ledgerly link does not create an engagement merely to enable switching. A QuoteBench switch may begin legitimate proposal creation within QuoteBench; PracticeEngine stores only the stable proposal/version reference returned through the existing contract.
