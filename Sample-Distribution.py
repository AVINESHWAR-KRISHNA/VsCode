from sqlalchemy import create_engine, text
from queue import Queue
import pandas as pd
import os, sys
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

MIN_WORKERS = 2
MAX_WORKERS = 15

POOL_SIZE = 2
MAX_OVERFLOW = 15
POOL_TIMEOUT = 90
POOL_RECYCLE = 900

MAPPING_FLAG = True

Worker = MIN_WORKERS
Executor = ThreadPoolExecutor(max_workers=Worker)

DF_lock = Lock()
Pause_Event = Event()

DF = pd.DataFrame()
MAP_DF = pd.DataFrame()
MAPPING_CONNECTIONS = dict()

Server = '00000000000'
Database = '00000000000'
Query = "SELECT * FROM [dbo].[Sample] WHERE [Status] = 0;"
MAP_Query = "SELECT * FROM [dbo].[Mapping] WHERE [Active] = 1;"

def Connection(Server, Database):
    try:
        Engine = create_engine('mssql+pyodbc://'+Server+'/'+Database+'?driver=ODBC+Driver+17+for+SQL+Server;Trusted_Connection=yes',
            fast_executemany=True,
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
            pool_timeout=POOL_TIMEOUT,
            pool_recycle=POOL_RECYCLE
        )
        return Engine.connect()
    
    except Exception as e:
        print(e)

def Mapping_Connection(MAP_DF):

    if not MAP_DF.empty:
        for index, row in MAP_DF.iterrows():
            Name = row[0]
            try:
                Engine = create_engine('mssql+pyodbc://'+Server+'/'+Database+'?driver=ODBC+Driver+17+for+SQL+Server;Trusted_Connection=yes',
                    fast_executemany=True,
                    pool_size=POOL_SIZE,
                    max_overflow=MAX_OVERFLOW,
                    pool_timeout=POOL_TIMEOUT,
                    pool_recycle=POOL_RECYCLE
                )
                
                MAPPING_CONNECTIONS[Name] = Engine.connect()
            
            except Exception as e:
                print(e)

def Get_Data(Server, Database, Query):
    Conn = Connection(Server, Database)
    global MAPPING_FLAG, MAP_DF

    try:
        df = pd.read_sql(Query, Conn)

        if MAPPING_FLAG:
            MAPPING_FLAG = False
            MAP_DF = pd.read_sql(MAP_Query, Conn)
            Mapping_Connection(MAP_DF)

        try:
            ids = df['ID'].tolist()

            with Conn.begin() as Transaction:
                Conn.execute(text("Update [dbo].[Sample] SET [Status] = 1 WHERE ID IN (:ids)"), ids=ids)
                Transaction.commit()

        except Exception as e:
            print(e)

        return df
    
    except Exception as e:
        print(e)

def Distribute_Data(DF):

    try:  
        Pause_Event.set()

        with DF_lock:

            DF_Copy = DF.copy()
            copied_ids = DF_Copy['ID'].tolist()
            DF.drop(DF[DF['ID'].isin(copied_ids)].index, inplace=True)

        Pause_Event.clear()

        try:
            DF_Copy
            DF_Copy.drop(DF_Copy.index, inplace=True) #Empty this data frame once the data is distributed.

        except Exception as e:
            print(e)

    except Exception as e:
        print(e)

def Processing(Server, Database, Query, DF):
    global Worker

    while True:
        try:
            Pause_Event.wait()

            df = Get_Data(Server, Database, Query)

            if not df.empty:
                with DF_lock:
                    try:
                        DF = pd.concat([DF, df], ignore_index=True)

                    except Exception as e:
                        print(e)

                busy_workers = sum(1 for thread in Executor._threads if thread.is_alive())
                if busy_workers == Worker:
                    
                    if Worker < MAX_WORKERS:
                        Worker += MIN_WORKERS
                        Executor._max_workers = Worker
            else:
                
                if Worker > MIN_WORKERS:
                    Worker = MIN_WORKERS
                    Executor._max_workers = Worker

        except Exception as e:
            print(e)

if __name__ == '__main__':
    try:
        while True:
            Executor.submit(Processing, Server, Database, Query, DF)

            _Thread = sum(1 for thread in Executor._threads if thread.is_alive())
            print("Active Workers :: {0}".format(_Thread))

    except KeyboardInterrupt:
        print("Shutting down...")
        Executor.shutdown(wait=True)

    print("All workers have shut down.")
