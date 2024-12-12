import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';

import { ColumnInfo, SearchMethod, type ApiRequestor, type BasicStatAggregation,
  type ColumnSortParams, type DatasetInfo, type TConditionNode, type Value, type WidgetArgs } from 'pa-typings';
import { GeoPoint, geoToString, getDurationAsStruct, getTConditionValue,
  hasGeo,
  hasTextId, isGeoPoint, joinAnd, variantToDate } from 'helper';

import '@formatjs/intl-durationformat';

import './styles.css';

interface Props {
  requestor: ApiRequestor;
  args?: WidgetArgs;
  setCondition: (cond: TConditionNode) => void;
}

type WrapperGuidState = {
  guid: string;
  filterGuid: string;
  sortGuid: string;
  distinctGuid: string;
};

export const TestWidget: React.FC<Props> = ({ requestor, args, setCondition }) => {
  const stateGuid = React.useRef<WrapperGuidState>({
    guid: '',
    filterGuid: '',
    sortGuid: '',
    distinctGuid: ''
  });

  const prevFilter = React.useRef<string>('');
  const [filter, setFilter] = React.useState('');
  const [search, setSearch] = React.useState<string | number>();

  const [columnId, setColumnId] = React.useState<number>(0);
  const [rowCount, setRowCount] = React.useState(50);
  const [info, setInfo] = React.useState<DatasetInfo>({ columns: [], rowCount: 0, flags: {} });
  const [rowIDs, setRowIDs] = React.useState<string[]>([]);
  const [values, setValues] = React.useState<Value[][]>([]);

  const [stats, setStats] = React.useState<BasicStatAggregation[]>([]);

  const getInfo = async (wrapperGuid: string) => {
    const dsInfo = await requestor.info({ wrapperGuid });
    setInfo(dsInfo);
    return dsInfo;
  };

  const getValues = async (wrapperGuid: string, rowCount = info.rowCount, offset = 0) => {
    const data = await requestor.values({
      offset,
      rowCount,
      wrapperGuid: wrapperGuid
    });
    if (data.table) {
      setRowIDs(data.rowIDs);
      setValues(data.table);
    }
  };

  React.useEffect(() => {
    const fetchData = async () => {
      const guid = await requestor.wrapperGuid();
      stateGuid.current.guid = guid.wrapperGuid;
      const dsInfo = await getInfo(guid.wrapperGuid);

      setInfo(dsInfo);
      setColumnId(dsInfo.columns[0].id);
      await getValues(guid.wrapperGuid, dsInfo.rowCount);
    };
    fetchData();
  }, [requestor]);

  const getStatistics = () => {
    requestor.statistics?.({
      wrapperGuid: stateGuid.current.guid,
      columnId
    }).then((data) => {
      setStats(data.basicStatistics);
    });
  };

  const onFilter = () => {
    if (!filter && !stateGuid.current.filterGuid || prevFilter.current === filter)
      return;

    const guid = stateGuid.current.guid;
    if (filter == '' && stateGuid.current.filterGuid) {
      getValues(guid);
      return;
    }

    const column = info.columns.find(c => c.id === columnId);
    if (column == undefined)
      return;

    const isString = hasTextId(column.type);

    requestor.filter({
      action: 0,
      columnId: column.id,
      delta: 0,
      howsearch: 0,
      matchCase: false,
      strValue: isString ? String(filter) : '',
      usePDL: false,
      useRegEx: false,
      value: isString ? 0 : Number(filter),
      wrapperGuid: stateGuid.current.guid,
      columnName: column.title,
      columnType: column.type
    }).then(async ({ wrapperGuid }) => {
      prevFilter.current = filter;
      stateGuid.current.filterGuid = wrapperGuid;
      const info = await requestor.info({ wrapperGuid });
      getValues(wrapperGuid, info.rowCount);
    });
  };

  const onSearch = () => {
    const column = info.columns.find(c => c.id === columnId);
    if (column == undefined)
      return;

    const wrapperGuid = stateGuid.current.filterGuid || stateGuid.current.guid;
    const isString = hasTextId(column.type);
    requestor.search({
      wrapperGuid,
      columnId: column.id,
      columnName: column.title,
      columnType: column.type,
      intValue: isString ? 0 : String(search),
      doubleValue: isString ? 0 : Number(search),
      delta: 0,
      text: isString ? String(search) : '',
      searchFrom: 0,
      day: 0,
      month: 0,
      year: 0,
      searchHow: isString ? SearchMethod.BY_PALONGVALUE : SearchMethod.SIMPLE,
      matchCase: false,
      searchUp: false,
      useRegex: false,
      uniqueId: uuidv4()
    }).then(({ foundPosition }) => {
      if (foundPosition !== -1) {
        getValues(wrapperGuid, 1, foundPosition);
      } else {
        getValues(wrapperGuid);
      }
    });
  };

  const onSort = (columns: ColumnSortParams[]) => {
    const guid = stateGuid.current.filterGuid || stateGuid.current.guid;
    requestor.sort({ wrapperGuid: guid, columns })
      .then(async ({ wrapperGuid }) => {
        prevFilter.current = filter;
        stateGuid.current.sortGuid = wrapperGuid;
        const info = await requestor.info({ wrapperGuid });
        getValues(wrapperGuid, info.rowCount);
      });
  };

  const onDistinct = () => {
    if (stateGuid.current.distinctGuid) {
      stateGuid.current.distinctGuid = '';
      getValues(stateGuid.current.guid);
      return;
    }

    requestor.distinct({
      columnId,
      wrapperGuid: stateGuid.current.guid
    })
      .wrapperGuid()
      .then(async ({ wrapperGuid }) => {
        stateGuid.current.distinctGuid = wrapperGuid;
        const info = await requestor.info({ wrapperGuid });
        getValues(wrapperGuid, info.rowCount);
      });
  };

  const convertGeoToJSON = (v: GeoPoint) => {
    return `{${v.latitude}; ${v.longitude}; ${v.elevation}}`;
  };

  const onDrillDown = async (id: number) => {
    if (args?.isEditor)
      return;

    const cols = info.columns.filter(c => c.type !== 'Text');
    const data = await requestor.values({
      wrapperGuid: stateGuid.current.guid,
      columnIndexes: cols.map((c) => c.id),
      rowIDs: [id],
      rowCount: 1,
      offset: 1
    });
    const condition = joinAnd(cols.map(({ title, type }, i) => {
      const value = data.table![0][i];
      return {
        columnName: title,
        ...getTConditionValue(hasGeo(type) ? convertGeoToJSON(value as unknown as GeoPoint) : value, type)
      };
    }));
    condition.cdata = JSON.stringify([id]);
    setCondition(condition);
    args?.openDrillDown(condition, { navigate: undefined });
  };

  const getDataValue = (value: Value, colId: number, columns: ColumnInfo[]) => {
    switch (columns[colId].type) {
      case 'Integer':
        return Number(value);
      case 'Bool':
        return Boolean(value).toString();
      case 'NumID':
        return String(value);
      case 'DateTime':
        return variantToDate(+value).toLocaleString();
      case 'String':
        return String(value);
      case 'Duration': {
        const duration = getDurationAsStruct(+value);
        return new Intl.DurationFormat('en', { style: 'short' }).format(duration);
      }
      case 'Numeric':
        return Number(value);
      case 'Text':
        return String(value);
      case 'Geo':
        return isGeoPoint(value) ? geoToString(value) : value;
      case 'UUID':
        return String(value);
      default:
        return value;
    }
  };

  const rendererTable = () => {
    let columns = info.columns;
    if (stateGuid.current.distinctGuid) {
      columns = [
        { id: 0, title: 'Value', type: columns[columnId].type },
        { id: 1, title: 'Count', type: 'Integer' },
        { id: 2, title: 'Percent', type: 'Integer' }
      ] as ColumnInfo[];
    }

    return (
      <div className='container-table'>
        <table>
          <thead>
            <tr>
              <th key={'record'}>#</th>
              {columns.map(c => (<th key={c.id}>{c.title}</th>))}
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => {
              const id = rowIDs[i];
              return (
                <tr key={id} onClick={() => onDrillDown(+id)}>
                  <th key={id}>{id}</th>
                  {v.map((r, i) => (<th key={i}>{getDataValue(r, i, columns)}</th>))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const rendererColumnSelector = () => {
    return (
      <div style={{ width: '100%', padding: '5px 0' }}>
        <label htmlFor='columns'>Choose a column:</label>
        <select
          name='columns'
          id='columns'
          onChange={(e) => {
            setColumnId(+e.target.value);
            stateGuid.current.distinctGuid = '';
            getValues(stateGuid.current.guid);
          }}
          value={columnId || 0}
        >
          {info.columns.map(c => (<option key={c.id} value={c.id}>{c.title}</option>))}
        </select>
      </div>
    );
  };

  const rendererDistinctButton = () => {
    return (
      <div style={{ width: '100%', padding: '5px 0' }}>
        <button
          id='distinct'
          onClick={onDistinct}
        >
          {stateGuid.current.distinctGuid ? 'Not distinct values' : 'Distinct values'}
        </button>
      </div>
    );
  };

  const rendererGetRowCount = () => {
    return (
      <div style={{ width: '100%', padding: '5px 0' }}>
        <label htmlFor='rowCount'>Get row count</label>
        <input
          name='rowCount'
          defaultValue={50}
          style={{ marginLeft: '10px' }}
          size={4}
          onChange={({ target }) => setRowCount(+target.value)}
        />
        <button
          style={{ marginLeft: 5 }}
          onClick={() => getValues(stateGuid.current.guid, rowCount)}
        >
          Send
        </button>
      </div>
    );
  };

  const rendererFilter = () => {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
        }}
      >
        <div style={{ width: '100%', padding: '5px 0' }}>
          <label htmlFor='filter'>Filter</label>
          <input name='filter' style={{ marginLeft: '10px' }} onChange={(e) => setFilter(e.target.value)} />
          <button
            style={{ marginLeft: 5 }}
            onClick={() => onFilter()}
          >
            Filter
          </button>
        </div>
        <div style={{ width: '100%', padding: '5px 0' }}>
          <label htmlFor='filter'>Search</label>
          <input
            name='filter'
            style={{ marginLeft: '10px' }}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            style={{ marginLeft: 5 }}
            onClick={onSearch}
          >
            Search
          </button>
        </div>
      </div>
    );
  };

  const rendererSort = () => {
    return (
      <div
        style={{
          display: 'flex',
          gap: 10,
          width: '100%',
          padding: '5px 0'
        }}
      >
        <label htmlFor='filter'>Sort</label>
        <button
          onClick={() => onSort([])}
        >
          Unsort
        </button>
        <button
          onClick={() => {
            const column = info.columns.find(c => c.id === columnId);
            if (column == undefined)
              return;
            onSort([
              {
                columnId: column.id,
                columnName: column.title,
                columnType: column.type,
                descending: false
              }
            ]);
          }}
        >
          Sort by value
        </button>
      </div>
    );
  };

  return (
    <div className='main'>
      {rendererColumnSelector()}
      {rendererDistinctButton()}
      {rendererGetRowCount()}
      {rendererFilter()}
      {rendererSort()}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          padding: '5px 0'
        }}
      >
        <button onClick={getStatistics}>Statistics</button>
        <div style={{
          display: 'grid',
          gridAutoFlow: 'column dense',
          gridTemplateRows: '20px 20px',
          gridTemplateColumns: 'auto',
        }}
        >
          {stats.map((s) => (
            <React.Fragment key={s.type}>
              <div>{s.type}</div>
              <div>{s.value}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
      {rendererTable()}
    </div>
  );
};
