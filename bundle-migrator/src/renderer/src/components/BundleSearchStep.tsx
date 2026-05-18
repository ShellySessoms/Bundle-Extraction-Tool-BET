import React, { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Heading, Text, Button, TextField, Badge } from '@radix-ui/themes'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable
} from '@tanstack/react-table'
import type { BundleListItem, BundleSearchType } from '../../../shared/types'

interface Props {
  onNext: (bundles: BundleListItem[]) => void
  onBack: () => void
}

const columnHelper = createColumnHelper<BundleListItem>()

const templateColumns = [
  columnHelper.accessor('name', { header: 'Name', size: 200 }),
  columnHelper.accessor('version', { header: 'Version', size: 80 }),
  columnHelper.accessor('isConsolidation', {
    header: 'Consolidation',
    size: 100,
    cell: (info) => info.getValue() ? 'Yes' : 'No'
  }),
  columnHelper.accessor('description', { header: 'Description', size: 250 })
]

const bundleColumns = [
  columnHelper.accessor('relationshipName', {
    header: 'Account (Borrower)',
    size: 180,
    cell: (info) => {
      const val = info.getValue()
      return val
        ? val
        : <em style={{ color: 'var(--gray-8)' }}>— No Account —</em>
    }
  }),
  columnHelper.accessor('name', { header: 'Bundle Name', size: 200 }),
  columnHelper.accessor('collateralName', {
    header: 'Collateral',
    size: 140,
    cell: (info) => {
      const val = info.getValue()
      return val ? val : <span style={{ color: 'var(--gray-8)' }}>—</span>
    }
  }),
  columnHelper.accessor('financialConsolidationName', {
    header: 'Consolidation',
    size: 140,
    cell: (info) => {
      const val = info.getValue()
      return val ? val : <span style={{ color: 'var(--gray-8)' }}>—</span>
    }
  }),
  columnHelper.accessor('version', { header: 'Version', size: 80 })
]

const allColumns = [
  columnHelper.accessor('isTemplate', {
    header: 'Type',
    size: 80,
    cell: (info) => (
      <Badge size="1" color={info.getValue() ? 'blue' : 'orange'}>
        {info.getValue() ? 'Template' : 'Bundle'}
      </Badge>
    )
  }),
  columnHelper.accessor('relationshipName', {
    header: 'Account',
    size: 150,
    cell: (info) => {
      const val = info.getValue()
      return val ? val : <span style={{ color: 'var(--gray-8)' }}>—</span>
    }
  }),
  columnHelper.accessor('name', { header: 'Name', size: 200 }),
  columnHelper.accessor('collateralName', {
    header: 'Collateral',
    size: 130,
    cell: (info) => {
      const val = info.getValue()
      return val ? val : <span style={{ color: 'var(--gray-8)' }}>—</span>
    }
  }),
  columnHelper.accessor('version', { header: 'Version', size: 80 }),
  columnHelper.accessor('description', { header: 'Description', size: 200 })
]

const PLACEHOLDERS: Record<BundleSearchType, string> = {
  template: 'Search templates by name...',
  bundle: 'Search by bundle name or account...',
  all: 'Search all bundles and templates...'
}

export default function BundleSearchStep({ onNext, onBack }: Props): React.ReactElement {
  const [bundleType, setBundleType] = useState<BundleSearchType>('template')
  const [bundles, setBundles] = useState<BundleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError('')
    setSelectedIds(new Set())
    window.api
      .searchBundles('', bundleType)
      .then(setBundles)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [bundleType])

  const filtered = useMemo(() => {
    if (!filter) return bundles
    const lower = filter.toLowerCase()
    return bundles.filter((b) =>
      b.name.toLowerCase().includes(lower) ||
      (b.relationshipName ?? '').toLowerCase().includes(lower)
    )
  }, [bundles, filter])

  const columns = useMemo(() => {
    switch (bundleType) {
      case 'template': return templateColumns
      case 'bundle': return bundleColumns
      case 'all': return allColumns
    }
  }, [bundleType])

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  const toggleSelection = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const tabBtn = (label: string, value: BundleSearchType): React.ReactElement => (
    <Button
      size="1"
      variant={bundleType === value ? 'solid' : 'soft'}
      onClick={() => { setBundleType(value); setFilter('') }}
    >
      {label}
    </Button>
  )

  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Select a Bundle</Heading>

      {error && (
        <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-2)' }}>
          <Text color="red" size="2">{error}</Text>
        </Box>
      )}

      <Flex gap="2" align="center">
        <Text size="2" weight="medium">Show:</Text>
        {tabBtn('Templates', 'template')}
        {tabBtn('Bundles', 'bundle')}
        {tabBtn('All', 'all')}
      </Flex>

      <Flex align="center" gap="3">
        <Box flexGrow="1">
          <TextField.Root
            placeholder={PLACEHOLDERS[bundleType]}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Box>
        <Text size="2" color="gray">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
        </Text>
      </Flex>

      <Flex align="center" gap="3">
        <Text size="2" color="gray">
          {selectedIds.size === 0
            ? 'No templates selected'
            : `${selectedIds.size} template${selectedIds.size > 1 ? 's' : ''} selected`}
        </Text>
        {filtered.length > 0 && (
          <Button
            variant="ghost"
            size="1"
            onClick={() => {
              if (selectedIds.size === filtered.length) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(filtered.map((b) => b.id)))
              }
            }}
          >
            {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}
      </Flex>

      {loading ? (
        <Text size="2" color="gray">Loading...</Text>
      ) : (
        <Box style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  <th style={{
                    width: 36,
                    padding: '8px 8px 8px 10px',
                    borderBottom: '1px solid var(--gray-5)',
                    background: 'var(--gray-2)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }} />
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--gray-5)',
                        background: 'var(--gray-2)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = selectedIds.has(row.original.id)
                return (
                  <tr
                    key={row.id}
                    onClick={() => toggleSelection(row.original.id)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'var(--blue-3)' : undefined
                    }}
                  >
                    <td style={{ width: 36, padding: '6px 8px 6px 10px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelection(row.original.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '6px 10px',
                          borderBottom: '1px solid var(--gray-3)'
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Box>
      )}

      {bundleType === 'bundle' && !loading && filtered.length > 0 && (
        <Box p="3" style={{ background: 'var(--blue-2)', borderRadius: 'var(--radius-2)' }}>
          <Text size="2" color="blue">
            Bundles are associated with specific borrower accounts. Select the bundle you want to extract from the account above.
          </Text>
        </Box>
      )}

      <Flex gap="3">
        <Button variant="soft" onClick={onBack}>&larr; Back</Button>
        <Button
          onClick={() => {
            const selected = bundles.filter((b) => selectedIds.has(b.id))
            onNext(selected)
          }}
          disabled={selectedIds.size === 0}
        >
          {selectedIds.size > 1
            ? `Extract ${selectedIds.size} Templates →`
            : 'Extract Template →'}
        </Button>
      </Flex>
    </Flex>
  )
}
